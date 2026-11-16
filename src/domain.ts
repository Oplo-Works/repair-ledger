// Pure domain logic — no Firebase imports, unit-testable.
export const CATEGORIES = ["heating", "water_leak", "mold", "pest", "unknown"] as const;
export type Category = (typeof CATEGORIES)[number];

export type RecordStatus = "Draft" | "Processing" | "Needs Review" | "Confirmed" | "Included in Letter";

export type ConfirmationSource = "model" | "manual";

export interface RepairRecord {
  id: string;
  rawText: string; // original user memo, always preserved
  aiText: string | null; // AI raw suggestion (version 1 of 2 preserved)
  confirmedText: string | null; // user-confirmed text (version 2 of 2)
  confirmationSource?: ConfirmationSource | null; // additive 2026-11-16 (P1 fix, DATA-CONTRACT Change Log); absent on pre-fix records
  category: Category;
  occurredOn: string; // ISO date from UI/code parsing (primary), "" if unknown
  location: string; // from UI input (primary)
  suggestedOccurredOn: string | null; // Nano suggestion only, never auto-applied
  suggestedLocation: string | null; // Nano suggestion only
  status: RecordStatus;
  inferenceSource: string | null; // actual response value, e.g. "ON_DEVICE"
  latencyMs: number | null;
  createdAt: number;
}

export interface LetterSentence { text: string; sourceRecordIds: string[] }
export interface Letter {
  id: string;
  sentences: LetterSentence[];
  inferenceSource: string | null;
  latencyMs: number | null;
  model: string;
  status: "Valid" | "Invalidated";
  createdAt: number;
}

const TRANSITIONS: Record<RecordStatus, RecordStatus[]> = {
  Draft: ["Processing", "Needs Review"],
  Processing: ["Needs Review"], // success and failure both land in Needs Review; raw text preserved
  "Needs Review": ["Confirmed", "Draft"],
  Confirmed: ["Included in Letter", "Needs Review"], // edit of a confirmed record invalidates its confirmation
  "Included in Letter": ["Needs Review"],
};

/** Manual entry on the review screen (the classification-failure path): user-typed summary/category become the record state immediately, so no re-render can lose them. */
export function applyManualEntry(rec: RepairRecord, entry: { text?: string; category?: Category; occurredOn?: string; location?: string }): RepairRecord {
  return {
    ...rec,
    confirmedText: entry.text !== undefined ? entry.text : rec.confirmedText,
    category: entry.category !== undefined ? entry.category : rec.category,
    occurredOn: entry.occurredOn !== undefined ? entry.occurredOn : rec.occurredOn,
    location: entry.location !== undefined ? entry.location : rec.location,
  };
}

/** "manual" = confirmed without any successful model classification; "model" = model classified and the user confirmed/checked it. */
export function resolveConfirmationSource(rec: RepairRecord): ConfirmationSource {
  return rec.aiText ? "model" : "manual";
}

/** Save-state label mapping (4 stages). Kept pure so listener metadata transitions are regression-tested.
 * Stage 4 is produced by listener/write errors, not by a snapshot. */
export function saveStateLabel(s: { saveAttempted: boolean; hasPendingWrites: boolean; fromCache: boolean; failed?: boolean }): string {
  if (s.failed) return "Save state: 4) sync failed (동기화 실패)";
  if (!s.saveAttempted && !s.hasPendingWrites) return "Save state: no saves yet this session";
  if (s.hasPendingWrites) return "Save state: 1) device reflected → 2) sync pending (기기 반영 / 동기화 대기)";
  if (s.fromCache) return "Save state: 1) device reflected (기기 반영 — cached)";
  return "Save state: 3) server reflected (서버 반영)";
}

/** Confirm & Save is only legal from Needs Review with non-empty confirmed text (prevents saving a still-Processing or empty record). */
export function canConfirm(status: RecordStatus, confirmedText: string): boolean {
  return status === "Needs Review" && confirmedText.trim().length > 0;
}

export function canTransition(from: RecordStatus, to: RecordStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Editing raw/confirmed text invalidates any prior AI confirmation (BUILD-PLAN v2.1). */
export function applyEdit(rec: RepairRecord, newText: string): RepairRecord {
  return { ...rec, confirmedText: newText, status: rec.status === "Draft" ? "Draft" : "Needs Review" };
}

/** App-code timeline sort (not cloud-generated). Unknown dates go last. */
export function sortTimeline(records: RepairRecord[]): RepairRecord[] {
  return [...records].sort((a, b) => {
    if (!a.occurredOn && !b.occurredOn) return a.createdAt - b.createdAt;
    if (!a.occurredOn) return 1;
    if (!b.occurredOn) return -1;
    return a.occurredOn.localeCompare(b.occurredOn) || a.createdAt - b.createdAt;
  });
}

export type LetterValidation =
  | { ok: true }
  | { ok: false; reason: string; badIds: string[] };

/** Every cited ID must exist AND be in a confirmed state. Any failure = whole letter fails. No auto-retry. */
export function validateLetter(sentences: LetterSentence[], records: RepairRecord[]): LetterValidation {
  if (!Array.isArray(sentences) || sentences.length === 0)
    return { ok: false, reason: "Letter has no sentences", badIds: [] };
  const byId = new Map(records.map((r) => [r.id, r]));
  const bad = new Set<string>();
  for (const s of sentences) {
    if (!s.text?.trim() || !Array.isArray(s.sourceRecordIds) || s.sourceRecordIds.length === 0)
      return { ok: false, reason: "Sentence without text or citations", badIds: [...bad] };
    for (const id of s.sourceRecordIds) {
      const rec = byId.get(id);
      if (!rec || (rec.status !== "Confirmed" && rec.status !== "Included in Letter")) bad.add(id);
    }
  }
  return bad.size ? { ok: false, reason: "Cited record missing or not Confirmed", badIds: [...bad] } : { ok: true };
}

/**
 * No-silent-fallback guard. Measured SDK behavior (firebase 13.3.0, @firebase/ai dist index.esm.js:1224-1231, 2562-2566):
 * if `LanguageModel` is absent the SDK creates no ChromeAdapter and callCloudOrDevice() calls the cloud
 * even for ONLY_ON_DEVICE. So the app must refuse BEFORE any generateContent() call.
 */
export function assertOnDeviceCapable(hasLanguageModel: boolean, availability: string | null): void {
  if (!hasLanguageModel)
    throw new Error("On-device model unavailable: Chrome Prompt API (LanguageModel) not present in this browser/profile. Request was NOT sent to the cloud (no silent fallback).");
  if (availability === "unavailable")
    throw new Error("On-device model unavailable: LanguageModel.availability() = 'unavailable' in this profile. Request was NOT sent to the cloud (no silent fallback).");
}

export const hasHangul = (s: string) => /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(s);

/** Highlight dates, numbers, amounts, unit/room numbers and Latin-script names for side-by-side comparison. Input must already be HTML-escaped. */
export function highlightFacts(escaped: string): string {
  return escaped.replace(/(\d+\s*월\s*\d+\s*일|\d+\s*월|\d+\s*일|\d+\s*달러|\$\s*\d+|\d+\s*층|\d+\s*호|\d+\s*개|\d+\s*주일?|November\s*\d+|[A-Z][a-z]+)/g, "<mark>$1</mark>");
}

const DEFECT_KEYWORDS: Record<Exclude<Category, "unknown">, string[]> = {
  heating: ["heat", "hot water", "radiator", "boiler", "heater", "heating", "freezing", "warm", "난방", "보일러", "히터", "온수"],
  water_leak: ["leak", "dripping", "faucet", "ceiling", "bucket", "seeping", "clogged", "누수", "물이 새", "배관", "새고"],
  mold: ["mold", "mould", "musty", "black spots", "곰팡이"],
  pest: ["cockroach", "mice", "mouse", "droppings", "pest", "bugs", "바퀴벌레", "벌레", "쥐"],
};

/** Deterministic keyword scan (app code, not the model) used to warn about multi-defect memos. */
export function detectDefectCategories(text: string): Category[] {
  const t = text.toLowerCase();
  return (Object.keys(DEFECT_KEYWORDS) as (keyof typeof DEFECT_KEYWORDS)[]).filter((c) => DEFECT_KEYWORDS[c].some((k) => t.includes(k)));
}

/** The exact on-device prompt (Schema B). Kept in domain so regression tests pin its behavior contract. */
export function buildClassifyPrompt(rawText: string): string {
  return `Classify this NYC tenant repair memo into exactly one category (heating, water_leak, mold, pest, unknown). ` +
    `Use "unknown" if it does not clearly fit — never force a category. Write a one-sentence factual summary using ONLY facts in the memo. Memo:\n"""${rawText}"""`;
}

/** A letter must be invalidated when any record it cites is edited or deleted. */
export function letterNeedsInvalidation(letter: Letter, changedRecordId: string): boolean {
  return letter.status === "Valid" && letter.sentences.some((s) => s.sourceRecordIds.includes(changedRecordId));
}
