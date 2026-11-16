import "./style.css";
import { configMissing, appCheckConfigured, db, ensureAnonUid, CLOUD_MODEL } from "./firebase";
import { prepareDeviceModel, classifyOnDevice, generateLetterInCloud } from "./ai";
import { applyEdit, letterNeedsInvalidation, sortTimeline, hasHangul, highlightFacts, detectDefectCategories, canConfirm, applyManualEntry, resolveConfirmationSource, saveStateLabel, CATEGORIES, type Letter, type RepairRecord } from "./domain";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
  env: $("env"), modelStatus: $("modelStatus"), diagAvail: $("diagAvail"), downloadProgress: $("downloadProgress"),
  date: $<HTMLInputElement>("dateInput"), loc: $<HTMLInputElement>("locInput"), memo: $<HTMLTextAreaElement>("memoInput"),
  classifyBtn: $<HTMLButtonElement>("classifyBtn"), classifyResult: $("classifyResult"), reviewBox: $("reviewBox"),
  consent1: $<HTMLInputElement>("consent1"), confirmBtn: $<HTMLButtonElement>("confirmBtn"), saveStatus: $("saveStatus"),
  recordList: $("recordList"), letterPreview: $("letterPreview"), consent2: $<HTMLInputElement>("consent2"),
  letterBtn: $<HTMLButtonElement>("letterBtn"), letterOut: $("letterOut"), copyLetterBtn: $<HTMLButtonElement>("copyLetterBtn"),
};

let uid: string | null = null;
let records: RepairRecord[] = [];
let letters: Letter[] = [];
let current: RepairRecord | null = null; // record in the review box
const selected = new Set<string>();
let modelReady = false;

const badge = (r: { inferenceSource: string | null; latencyMs: number | null }) =>
  r.inferenceSource ? `<span class="badge" data-badge="inference" data-source="${r.inferenceSource}">inferenceSource=${r.inferenceSource} · ${r.latencyMs ?? "?"} ms</span>` : "";

// ---- environment / unsupported guidance (Gate 4: separated criteria) ----
async function renderEnv() {
  const lm = (globalThis as { LanguageModel?: { availability(): Promise<string> } }).LanguageModel;
  let avail = "LanguageModel API not present in this browser/profile";
  if (lm) { try { avail = await lm.availability(); } catch (e) { avail = `error: ${String(e)}`; } }
  el.diagAvail.textContent = avail;
  const unsupported = !lm || avail === "unavailable";
  el.env.innerHTML =
    `<b>Environment:</b> ${navigator.userAgent} · online=${navigator.onLine} · Firebase config ${configMissing ? "<b>MISSING (.env.local)</b> — saving/letter disabled, this is a config state, not an unsupported-device result" : "present"} · App Check ${appCheckConfigured ? "configured (reCAPTCHA Enterprise)" : "not configured"} · cloud model (explicit) = <code>${CLOUD_MODEL}</code>` +
    (unsupported
      ? `<p class="warn"><b>On-device AI is not available in this profile.</b> This is the expected result for a profile without the official setup. To use on-device inference: Chrome 139+ on desktop, enable <code>chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</code>, restart Chrome, then prepare the model below. No cloud fallback will be used silently.</p>`
      : "");
}
void renderEnv();

// Diagnostic availability check only; gate evidence comes from a real SDK call in classifyOnDevice().

// ---- Firestore (single save path, offline persistence configured in firebase.ts) ----
let saveAttempted = false; // until the first save of this session, the save-state label stays neutral ("No saves yet")
async function persistRecord(rec: RepairRecord) {
  saveAttempted = true;
  if (!db || !uid) throw new Error("Firestore unavailable: Firebase config missing.");
  const { doc, setDoc } = await import("firebase/firestore");
  el.saveStatus.dataset.stage = "pending";
  el.saveStatus.textContent = "Save state: device reflected → sync pending…";
  await setDoc(doc(db, "users", uid, "records", rec.id), rec);
}
async function deleteRecordRemote(id: string) {
  if (!db || !uid) return;
  const { doc, deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(db, "users", uid, "records", id));
}
async function persistLetter(letter: Letter) {
  if (!db || !uid) return;
  const { doc, setDoc } = await import("firebase/firestore");
  await setDoc(doc(db, "users", uid, "letters", letter.id), letter);
}
async function invalidateLettersFor(recordId: string) {
  for (const l of letters.filter((x) => letterNeedsInvalidation(x, recordId))) {
    l.status = "Invalidated";
    await persistLetter(l);
  }
  renderLetter();
  renderRecords();
}

async function initStore() {
  if (configMissing) return;
  uid = await ensureAnonUid();
  const { collection, onSnapshot } = await import("firebase/firestore");
  // includeMetadataChanges is required: a write ack changes only snapshot metadata (hasPendingWrites),
  // not document data, so without it the listener never re-fires and the label sticks at "sync pending" (P2).
  onSnapshot(collection(db!, "users", uid, "records"), { includeMetadataChanges: true }, (snap) => {
    records = snap.docs.map((d) => d.data() as RepairRecord);
    if (snap.metadata.hasPendingWrites) el.saveStatus.dataset.stage = "pending";
    else if (!saveAttempted) delete el.saveStatus.dataset.stage;
    else if (snap.metadata.fromCache) el.saveStatus.dataset.stage = "device";
    else el.saveStatus.dataset.stage = "server";
    el.saveStatus.textContent = saveStateLabel({ saveAttempted, hasPendingWrites: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache });
    renderRecords();
  }, (e) => { delete el.saveStatus.dataset.stage; el.saveStatus.textContent = `${saveStateLabel({ saveAttempted, hasPendingWrites: false, fromCache: false, failed: true })} — ${String(e)}`; });
  onSnapshot(collection(db!, "users", uid, "letters"), (snap) => {
    letters = snap.docs.map((d) => d.data() as Letter);
    renderLetter();
  });
}
void initStore().catch((e) => { delete el.saveStatus.dataset.stage; el.saveStatus.textContent = `Auth/Firestore error: ${String(e)}`; });

// ---- model lifecycle (first-screen UI) ----
$("prepareBtn").addEventListener("click", async () => {
  el.modelStatus.textContent = "Preparing on-device model (download may take several minutes)…";
  try {
    await prepareDeviceModel((pct) => { el.downloadProgress.textContent = `Download progress: ${pct}%`; });
    modelReady = true;
    el.modelStatus.innerHTML = `On-device model: <b>Ready</b> ${badge({ inferenceSource: null, latencyMs: null })}`;
  } catch (e) {
    modelReady = false;
    el.modelStatus.innerHTML = `<span class="warn">On-device model not available: ${String(e)}. No cloud fallback was used. If this profile has no official flag setup, the unsupported guidance above is the correct result for this profile.</span>`;
  }
  void renderEnv();
});

// Korean input (Decision 1, allow + disclose): non-blocking banner at input time, exact fixed wording.
el.memo.addEventListener("input", () => { $("koreanBanner").hidden = !/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(el.memo.value); });

// ---- step 1: local classification (ONLY_ON_DEVICE, no fallback) ----
el.classifyBtn.addEventListener("click", async () => {
  const rawText = el.memo.value.trim();
  if (!rawText) { el.classifyResult.innerHTML = `<span class="warn">Enter an English memo first.</span>`; return; }
  const rec: RepairRecord = {
    id: crypto.randomUUID(), rawText, aiText: null, confirmedText: null, confirmationSource: null, category: "unknown",
    occurredOn: el.date.value, location: el.loc.value.trim(), suggestedOccurredOn: null, suggestedLocation: null,
    status: "Processing", inferenceSource: null, latencyMs: null, createdAt: Date.now(),
  };
  current = rec;
  // Latency branch (measured 7–10s warm, 16–24s cold): strengthen progress UI instead of changing the pipeline.
  const started = Date.now();
  el.classifyResult.textContent = modelReady ? "Running on-device…" : "Model not marked ready — attempting ONLY_ON_DEVICE call anyway (it will throw if unavailable, no fallback).";
  const timer = setInterval(() => {
    el.classifyResult.textContent = `Running on-device… ${Math.round((Date.now() - started) / 1000)}s (first call in a new profile can include the model download and take minutes; no cloud fallback is running)`;
  }, 1000);
  try {
    // A generateContent() call made before initializeDeviceModel() can wait indefinitely in a fresh
    // profile (measured Day-3: >185 s), because the download is only kicked off by the gesture-gated
    // initialize call. So the classify click itself prepares the model first when needed.
    if (!modelReady) {
      el.modelStatus.textContent = "Preparing on-device model (download may take several minutes)…";
      await prepareDeviceModel((pct) => { el.downloadProgress.textContent = `Download progress: ${pct}%`; });
      modelReady = true;
      el.modelStatus.innerHTML = `On-device model: <b>Ready</b>`;
    }
    await classifyOnce(rec);
  } catch (e) {
    rec.status = "Needs Review";
    el.classifyResult.innerHTML = `<span class="warn">On-device model preparation failed: ${String(e)}<br/>Raw text preserved as “Needs Review”. No cloud request was sent.</span>`;
    renderReview();
  } finally { clearInterval(timer); }
});

async function classifyOnce(rec: RepairRecord) {
  try {
    const r = await classifyOnDevice(rec.rawText);
    Object.assign(rec, { aiText: r.rawAiText, confirmedText: r.summary, category: r.category, suggestedOccurredOn: r.suggestedOccurredOn, suggestedLocation: r.suggestedLocation, inferenceSource: r.inferenceSource, latencyMs: r.latencyMs, status: "Needs Review" });
    modelReady = true; // a successful ONLY_ON_DEVICE response proves the model is ready
    el.modelStatus.innerHTML = `On-device model: <b>Ready</b>`;
    el.classifyResult.innerHTML = `On-device result ${badge(r)}<br/>Category: <b>${r.category}</b> (use “unknown / Needs Review” freely — never forced)`;
  } catch (e) {
    rec.status = "Needs Review"; // raw text preserved on failure
    const unsupportedLang = /NotSupportedError|not supported|unsupported/i.test(String(e)) || /NotSupportedError/.test((e as Error)?.name ?? "");
    el.classifyResult.innerHTML = `<span class="warn">On-device classification failed: ${String(e)}<br/>Raw text preserved as “Needs Review”. No silent cloud fallback was used.` +
      (unsupportedLang ? `<br/>한국어 입력은 공식 지원되지 않습니다. 온디바이스 모델이 이 언어를 지원하지 않을 수 있습니다. 원문은 보존됐으니 영어로 다시 입력하거나 직접 분류·요약을 입력해 주세요.` : "") +
      `</span>`;
  }
  renderReview();
}

// ---- step 2: review / confirm / save (Consent 1) ----
function updateConfirmBtn() {
  if (!current) { el.confirmBtn.disabled = true; return; }
  el.confirmBtn.disabled = !(el.consent1.checked && !configMissing && canConfirm(current.status, current.confirmedText ?? ""));
}

function renderReview() {
  if (!current) return;
  const r = current;
  const korean = hasHangul(r.rawText);
  const manualEntryNote = !r.aiText && r.status === "Needs Review"
    ? `<p class="warn">Classification did not produce a result for this record. You can still save it: type the summary below, pick a category, and check Consent 1. Such a record is marked <b>“Entered manually by user”</b>.</p>` : "";
  el.reviewBox.innerHTML =
    (korean ? `<p class="warn">한국어 입력은 공식 지원되지 않습니다. 아래 원문에서 <mark>날짜·숫자·금액·이름</mark>을 확정 요약과 나란히 대조해 주세요. 장소: <b>${escapeHtml(r.location || "(unknown)")}</b> · 날짜: <b>${r.occurredOn || "(unknown)"}</b></p>` : "") +
    manualEntryNote +
    `<b>Original (always preserved):</b><br/><blockquote>${korean ? highlightFacts(escapeHtml(r.rawText)) : escapeHtml(r.rawText)}</blockquote>` +
    `<label>Confirmed text (edit freely — editing invalidates any prior confirmation)<br/><textarea id="confirmedText" rows="3">${escapeHtml(r.confirmedText ?? "")}</textarea></label><br/>` +
    `<label>Category <select id="categorySelect">${CATEGORIES.map((c) => `<option value="${c}" ${c === r.category ? "selected" : ""}>${c}</option>`).join("")}</select></label> ` +
    `<label>Date <input id="reviewDate" type="date" value="${escapeHtml(r.occurredOn)}" /></label> ` +
    `<label>Location <input id="reviewLocation" type="text" value="${escapeHtml(r.location)}" /></label><br/>` +
    (r.suggestedOccurredOn || r.suggestedLocation ? `<span class="note">Nano suggestions only (not applied): date=${r.suggestedOccurredOn ?? "-"}, location=${escapeHtml(r.suggestedLocation ?? "-")}. Your UI inputs above remain primary.</span><br/>` : "") +
    (() => { const detected = detectDefectCategories(r.rawText); return detected.length > 1
      ? `<p class="warn warn-multi">This memo appears to mention more than one defect type (${detected.join(", ")}), but a record is filed under one category only (<b>${r.category}</b>). Check that the summary below keeps every defect — and if another defect needs its own timeline entry, file it as a separate record after saving this one.</p>` : ""; })() +
    badge(r) + ` Status: <b><span class="chip" data-status="${r.status}">${r.status}</span></b>` +
    (r.confirmationSource ? `<br/><span class="badge" data-badge="provenance" data-provenance="${r.confirmationSource}">${r.confirmationSource === "manual" ? "Entered manually by user (no model classification)" : "Model-classified, user-confirmed"}</span>` : "");
  // Manual entry wiring: every keystroke/change updates record state immediately, so any
  // re-render (consent toggle, snapshot, status change) redraws from state and cannot wipe input.
  ($("confirmedText") as HTMLTextAreaElement).addEventListener("input", (e) => {
    if (!current) return;
    current = applyManualEntry(current, { text: (e.target as HTMLTextAreaElement).value });
    updateConfirmBtn();
  });
  ($("categorySelect") as HTMLSelectElement).addEventListener("change", (e) => {
    if (!current) return;
    current = applyManualEntry(current, { category: (e.target as HTMLSelectElement).value as RepairRecord["category"] });
  });
  ($("reviewDate") as HTMLInputElement).addEventListener("input", (e) => {
    if (!current) return;
    current = applyManualEntry(current, { occurredOn: (e.target as HTMLInputElement).value });
  });
  ($("reviewLocation") as HTMLInputElement).addEventListener("input", (e) => {
    if (!current) return;
    current = applyManualEntry(current, { location: (e.target as HTMLInputElement).value });
  });
  updateConfirmBtn();
}
// Consent toggle must NOT re-render the review (that used to risk wiping in-progress typing);
// it only re-evaluates the save button against already-synced state.
el.consent1.addEventListener("change", () => updateConfirmBtn());

el.confirmBtn.addEventListener("click", async () => {
  if (!current || !el.consent1.checked) return;
  const edited = ($("confirmedText") as HTMLTextAreaElement | null)?.value ?? "";
  if (!canConfirm(current.status, edited)) {
    delete el.saveStatus.dataset.stage;
    el.saveStatus.textContent = `Cannot save yet: the record must be in “Needs Review” with non-empty confirmed text (current status: ${current.status}). Wait for classification to finish and check the summary.`;
    return;
  }
  const wasConfirmed = current.status === "Confirmed" || current.status === "Included in Letter";
  current = applyEdit(current, edited);
  current.confirmationSource = resolveConfirmationSource(current);
  if (wasConfirmed) await invalidateLettersFor(current.id);
  // Non-blocking save: reflect on device immediately, let the snapshot listener report sync stages.
  // The screen never waits for the server acknowledgement (offline saves settle as "sync pending").
  current.status = "Confirmed";
  el.saveStatus.dataset.stage = "device";
  el.saveStatus.textContent = "Save state: 1) device reflected (기기 반영)";
  void persistRecord({ ...current }).catch((e) => { delete el.saveStatus.dataset.stage; el.saveStatus.textContent = `Save state: 4) sync failed (동기화 실패) — ${String(e)}`; });
  renderReview(); renderRecords();
});

// ---- records / timeline ----
function renderRecords() {
  const sorted = sortTimeline(records.length ? records : current ? [current] : []);
  if (!sorted.length) { el.recordList.textContent = "No records."; renderLetterPreview(); return; }
  // Timeline is sorted and grouped by app code only — the cloud never builds the timeline.
  let lastGroup = "";
  el.recordList.innerHTML = `<p class="note">Timeline: ${sorted.length} record(s), sorted by occurrence date (app code). Statuses move Draft → Processing → Needs Review → Confirmed → Included in Letter.</p>` + sorted.map((r) => {
    const group = r.occurredOn ? r.occurredOn.slice(0, 7) : "date-unknown";
    const header = group !== lastGroup ? `<h3 class="tl-group">${group === "date-unknown" ? "Date unknown" : group}</h3>` : "";
    lastGroup = group;
    return header +
    `<div class="rec" id="rec-${r.id}">
      <label><input type="checkbox" data-select="${r.id}" ${selected.has(r.id) ? "checked" : ""} ${r.status !== "Confirmed" && r.status !== "Included in Letter" ? "disabled" : ""}/> include in letter</label>
      <b>[${escapeHtml(r.occurredOn || "date unknown")}] ${escapeHtml(r.location || "")} — ${r.category}</b> · <span class="chip" data-status="${r.status}">${r.status}</span> ${badge(r)}<br/>
      <div class="cols"><div><i>Original:</i><br/>${escapeHtml(r.rawText)}</div><div><i>Confirmed summary (user-checked):</i><br/>${escapeHtml(r.confirmedText ?? "(not confirmed yet)")}</div></div>
      ${r.confirmationSource === "manual" ? `<span class="badge" data-badge="provenance" data-provenance="manual">Entered manually by user (no model classification)</span>` : r.confirmationSource === "model" ? `<span class="badge" data-badge="provenance" data-provenance="model">Model-classified, user-confirmed</span>` : ""}
      <button data-edit="${r.id}">Edit</button> <button data-del="${r.id}">Delete</button>
    </div>`;
  }).join("");
  el.recordList.querySelectorAll("[data-select]").forEach((c) => c.addEventListener("change", (e) => {
    const id = (e.target as HTMLInputElement).dataset.select!;
    (e.target as HTMLInputElement).checked ? selected.add(id) : selected.delete(id);
    renderLetterPreview();
  }));
  el.recordList.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", async (e) => {
    const id = (e.target as HTMLButtonElement).dataset.edit!;
    const rec = records.find((r) => r.id === id); if (!rec) return;
    current = applyEdit(rec, rec.confirmedText ?? rec.rawText); // edit invalidates confirmation
    await invalidateLettersFor(id);
    renderReview();
  }));
  el.recordList.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async (e) => {
    const id = (e.target as HTMLButtonElement).dataset.del!;
    await invalidateLettersFor(id);
    records = records.filter((r) => r.id !== id); selected.delete(id);
    await deleteRecordRemote(id);
    renderRecords();
  }));
  renderLetterPreview();
}

// ---- step 4: cloud letter (Consent 2, preview, ID contract) ----
function selectedRecords() { return sortTimeline(records.filter((r) => selected.has(r.id))); }
function renderLetterPreview() {
  const sel = selectedRecords();
  el.letterBtn.disabled = !(sel.length && el.consent2.checked && !configMissing);
  el.letterPreview.innerHTML = sel.length
    ? `<b>Exactly these ${sel.length} record(s) will be sent to Gemini (${CLOUD_MODEL}):</b><ul>` + sel.map((r) => `<li><code>${r.id}</code> — ${escapeHtml(r.confirmedText ?? r.rawText)}</li>`).join("") + "</ul>"
    : "Select Confirmed records above to preview exactly what will be sent.";
}
el.consent2.addEventListener("change", renderLetterPreview);

let lastLetter: Letter | null = null;
el.letterBtn.addEventListener("click", async () => {
  const sel = selectedRecords();
  if (!sel.length || !el.consent2.checked) return;
  delete el.letterOut.dataset.letterStatus;
  el.letterOut.textContent = "Generating in cloud (1 call)…";
  try {
    const r = await generateLetterInCloud(sel);
    lastLetter = { id: crypto.randomUUID(), sentences: r.sentences, inferenceSource: r.inferenceSource, latencyMs: r.latencyMs, model: r.model, status: "Valid", createdAt: Date.now() };
    void persistLetter(lastLetter);
    for (const rec of sel) { rec.status = "Included in Letter"; void persistRecord(rec).catch(() => {}); }
    renderLetter(); renderRecords();
  } catch (e) {
    // Failure recovery (model-independent): failure state shown, records are preserved, manual retry only — no auto-retry, no silent model switch.
    delete el.letterOut.dataset.letterStatus;
    el.letterOut.innerHTML = `<span class="warn">Letter generation failed: ${String(e)}</span><br/>Your selected records are preserved and unchanged. No letter was saved.<br/><button id="retryLetterBtn" type="button">Retry generation</button>`;
    $("retryLetterBtn").addEventListener("click", () => el.letterBtn.click());
  }
});

function renderLetter() {
  const l = [...letters].sort((a, b) => b.createdAt - a.createdAt)[0] ?? lastLetter;
  if (!l) return;
  lastLetter = l;
  el.letterOut.dataset.letterStatus = l.status;
  el.letterOut.innerHTML = `<b>Letter (<span class="chip" data-status="${l.status}">${l.status}</span>)</b> ${badge(l)} model=${l.model}<br/>` +
    l.sentences.map((s) => `<p class="sentence">${escapeHtml(s.text)} ${s.sourceRecordIds.map((id) => `<button data-cite="${id}" title="Trace to source record">[${id.slice(0, 8)}…]</button>`).join(" ")}</p>`).join("") +
    (l.status === "Invalidated" ? `<p class="warn">This letter was invalidated because a cited record was edited or deleted. Regenerate it.</p>` : "");
  el.copyLetterBtn.disabled = l.status !== "Valid";
  el.letterOut.querySelectorAll("[data-cite]").forEach((b) => b.addEventListener("click", (e) => {
    const id = (e.target as HTMLButtonElement).dataset.cite!;
    document.querySelectorAll(".rec").forEach((n) => n.classList.remove("highlight"));
    const node = document.getElementById(`rec-${id}`);
    if (node) { node.classList.add("highlight"); node.scrollIntoView({ behavior: "smooth", block: "center" }); }
    else el.letterOut.insertAdjacentHTML("beforeend", `<p class="warn">Source record ${id} not found in the current list.</p>`);
  }));
}
el.copyLetterBtn.addEventListener("click", async () => {
  if (lastLetter) await navigator.clipboard.writeText(lastLetter.sentences.map((s) => s.text).join(" "));
});
$("exportLetterBtn").addEventListener("click", () => {
  if (!lastLetter || lastLetter.status !== "Valid") return;
  const body = lastLetter.sentences.map((s) => s.text).join("\n\n") +
    `\n\n---\nGenerated by Repair Ledger (model: ${lastLetter.model}, inferenceSource: ${lastLetter.inferenceSource}). Source record IDs: ${[...new Set(lastLetter.sentences.flatMap((s) => s.sourceRecordIds))].join(", ")}`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/plain" }));
  a.download = "repair-letter.txt";
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---- sample data (synthetic, labeled) ----
$("loadSampleBtn").addEventListener("click", () => {
  el.memo.value = "No heat or hot water since Monday morning. The radiator in the bedroom is cold and the apartment is freezing.";
  el.loc.value = "Bedroom";
  el.classifyResult.innerHTML = `<span class="note">Sample data loaded — this is synthetic demo data, not a real record.</span>`;
});

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
