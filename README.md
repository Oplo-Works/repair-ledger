# Repair Ledger

Repair Ledger helps an NYC tenant turn short repair memos into a user-confirmed, dated record history: each memo is classified and summarized on-device in Chrome, the tenant compares it against the original and confirms it before saving, and — only when needed — selected confirmed records are combined in one cloud call into a landlord letter whose sentences can be traced back to the source records the model cites for them.

- **Live demo:** https://repair-ledger-6faaa.web.app
- **Repository:** https://github.com/Oplo-Works/repair-ledger
- **Built for:** [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/) — Web / Chrome track
- **Plan and frozen contract:** `docs/BUILD-PLAN.md` (v2.1), `docs/DATA-CONTRACT.md` (frozen 2026-11-16)

Citations in the letter are a review aid (traceability): clicking a citation shows which record a sentence came from so the user can check the sentence against that record. A citation does not establish that the underlying memo is true.

## Judge Quick Start

Judges: use Chrome on desktop. The walkthrough below follows the app's on-screen order (sections 0–4).

1. **Open the live demo** (link above) in Chrome desktop. The first screen shows an environment line and the on-device model panel (section 0, "On-device model").
2. **Check the model panel before typing anything.**
   - If it says **Not prepared**, click **"1. Prepare on-device model"**. Wait until preparation completes before classifying. In a fresh Chrome profile the first step includes the Gemini Nano model download; measured end-to-end (fresh profile, deployed URL, 2026-11-16) this was ~117 s of wall time including the download, and the classification call itself then measured 7,610 ms. A download-progress percentage is shown.
   - While that runs, you can click **Load sample data (synthetic)** — in the current build this fills the memo field with one synthetic heating memo. It is synthetic demo data, not a real record. It does **not** create saved records or a timeline by itself; you still run step 3 below on it. To see timeline sorting and a multi-record letter, add two or three more short memos the same way.
   - If the panel instead reports that the on-device model is not available in this profile, that explicit guidance is the expected result for that profile: classification is blocked **before** any cloud call rather than falling back (see "Core technical finding"). If on-device classification is unavailable in your profile, the later screens can still be reached through the manual-entry path described in step 4; records created that way are labelled as manually entered.
3. **Enter a memo and classify it.** Type a short English memo (or use the loaded sample), fill in date and location, then click **"2. Run on-device classification (ONLY_ON_DEVICE)"**.
   - **What to look at:** the badge on the result. It shows the *actual response value* — it must read `inferenceSource=on_device` plus a latency in ms. The badge is read from the response, not from the requested mode (`src/ai.ts:83-86`).
4. **Compare before saving (section 2).** The review screen puts the original memo next to the model-suggested summary and category. Edit the summary or category if the model got it wrong; for Korean originals the app highlights dates/numbers/amounts/names in the original to support this comparison (see "Limitations"). If a memo appears to mention more than one defect type, a warning is shown because one record holds one category. Check **Consent 1** (the original text will be synced to Firestore) and click **"3. Confirm & save to Firestore"**.
   - **What to look at:** the record's status becomes `Confirmed`, and the save-state label moves through device-reflected → sync-pending → server-reflected.
   - If classification failed or was blocked, the review box still holds the raw text as `Needs Review`, and you may type the summary and pick a category yourself. Such a record is labelled **"Entered manually by user"** so its provenance is visible.
5. **Build the letter (sections 3–4).** In the timeline, tick **include in letter** on one or more `Confirmed` records (unconfirmed records cannot be selected). Section 4 then previews exactly which records will be sent. Check **Consent 2** and click **"4. Generate letter in cloud (ONLY_IN_CLOUD, explicit model)"**.
   - **What to look at:** the letter's badge reads `inferenceSource=in_cloud` and names the model (`gemini-3.5-flash-lite`). In this app, a letter status of `Valid` means only that every cited record ID passed the app's ID/state validation, including rejecting sentences that carry no citations (`src/domain.ts:106-107`) — it is a technical status, not a statement about legal effect or factual truth. If generation fails with a quota (429) error, wait about a minute and use the Retry generation button; the selected records are preserved.
6. **Trace a sentence back.** Each letter sentence has a citation button showing the first characters of a record ID beside it. Click it.
   - **What to look at:** the app scrolls to and highlights the exact source record in the timeline, showing its original text and its user-confirmed summary side by side.
7. **Optional, if time permits:** edit or delete a record that the letter cites. The letter immediately flips to `Invalidated` and must be regenerated. This is the intended behaviour, not an error state.

## Why hybrid

The split follows how often each step runs. Classification repeats for every memo, so it runs on-device and sends nothing to the cloud for that step. Letter synthesis runs once per letter, in the cloud, only after a separate consent and an exact preview of the records to be sent. A cloud-only design would send every memo to a cloud model.

| Stage | Where it runs | How often | What crosses the boundary |
|---|---|---|---|
| Classify + summarize one memo | On-device: Gemini Nano (Chrome Prompt API) via Firebase AI Logic, `InferenceMode.ONLY_ON_DEVICE` plus a pre-flight guard | Once per memo (N times) | Nothing is sent to the cloud for this inference step. A result is accepted only if the response reports `inferenceSource=on_device`. |
| Save a confirmed record | Firestore with offline persistence (single save path) | Per saved record, only after Consent 1 | The record **including the original memo text** is synced to Firestore. The app does not claim otherwise. |
| Synthesize the landlord letter | Cloud: `gemini-3.5-flash-lite`, explicitly named, `InferenceMode.ONLY_IN_CLOUD` | One call per letter generation, only after Consent 2 and an exact send-preview | Only the records the user selected are sent. |
| Timeline sorting, citation validation, source highlighting | App code only, no AI call | Continuous | Nothing. Sorting and validation are deterministic code (`src/domain.ts:86-114`). |

Because classification repeats for every memo, running it on-device is what keeps that repeated step off the cloud endpoint, lets it run with the network blocked once the model is ready (measured offline: `on_device`, see `docs/day2/A6-A7-lifecycle-offline.md`), and means the cloud model is used only for the multi-record letter composition it is needed for.

## Core technical finding: the SDK's silent cloud fallback, and the guard that blocks it

This was found by reading SDK source and reproducing it live, then fixed and pinned with tests.

- With **firebase 13.3.0** (pinned in `package.json:14`), `InferenceMode.ONLY_ON_DEVICE` does **not** by itself keep a request on-device. In the bundled SDK source (`node_modules/@firebase/ai/dist/esm/index.esm.js:1224-1231`), `chromeAdapterFactory` returns no adapter when the Chrome Prompt API (`LanguageModel`) is absent, and `callCloudOrDevice()` (`:2562-2566`) then runs the cloud call. Measured live on Day-1: a profile without `LanguageModel` produced a cloud `generateContent` fetch despite the `ONLY_ON_DEVICE` request (`DAY1-REPORT.md:18`).
- **Fix:** the app refuses before any request is made. `assertOnDeviceCapable()` in `src/domain.ts:121-126` throws when `LanguageModel` is absent or reports `unavailable`; it is invoked by `guardOnDevice()` (`src/ai.ts:5-10`) at the start of both model preparation and `classifyOnDevice()` (`src/ai.ts:78-81`), i.e. before `generateContent()` is called.
- **Second check:** even after the guard, a classification result is accepted only when `result.response.inferenceSource === InferenceSource.ON_DEVICE` (`src/ai.ts:83-86`); otherwise the record is kept as `Needs Review` with its raw text and an explicit failure message. No silent fallback and no auto-retry. The guard is what blocks; the post-call check detects and rejects — it cannot undo a request that has already been sent.
- **Pinned by tests:** the guard behaviour is covered in `src/domain.test.ts:73-84` (blocks when `LanguageModel` is absent, blocks on `unavailable`, allows `downloadable`/`available` with success still proven by the response value afterwards).

## Trust design

- **State machine:** `Draft → Processing → Needs Review → Confirmed → Included in Letter` (`src/domain.ts:5`, transitions at `src/domain.ts:37-43`). Both classification success and failure land in `Needs Review`; the raw text is preserved on failure.
- **Nothing unconfirmed reaches a letter.** Records can be selected only in `Confirmed`/`Included in Letter` state, and `validateLetter()` (`src/domain.ts:100-114`) requires every cited ID to exist and be in a confirmed state, and rejects any sentence with an empty citation list (`src/domain.ts:106-107`). Any failure discards the whole letter; there is no partial letter and no auto-retry. The letter is a machine-generated draft for the tenant to review. The app makes no claim about its legal effect, and nothing in it is legal advice.
- **Original is never overwritten.** Each record preserves the user's original text; the AI raw output (when a classification produced one) and the user-confirmed text are stored as separate fields (`docs/DATA-CONTRACT.md:11-14`). Records confirmed without a model result carry `confirmationSource: "manual"` and are labelled "Entered manually by user".
- **Edits invalidate.** Editing a confirmed record returns it to `Needs Review`; editing or deleting any record a letter cites sets that letter to `Invalidated` (`src/domain.ts:155-157`). Regeneration is required.
- **Two separate consents, in order.** Consent 1 at save time (original text syncs to Firestore) must come first; Consent 2 at synthesis time is a separate checkbox preceded by a preview listing exactly the records to be sent.
- **Access control.** Anonymous Auth plus uid-scoped Firestore Security Rules (`firestore.rules:5-11`): a user can read/write only `users/{their-uid}/**`, everything else is denied. Verified 11/11 on the Firestore emulator (`tests/firestore.rules.test.mjs`, run via `npm run test:rules`). App Check (reCAPTCHA Enterprise, `src/firebase.ts:30-32`) protects the AI Logic endpoint and does **not** replace these rules.
- **Failure handling.** A failed classification leaves a `Needs Review` record with its raw text. A failed letter generation shows the failure, states that the selected records are preserved and no letter was saved, and offers a manual **Retry generation** button (`src/main.ts:289-293`). There is no auto-retry and no silent model switch, including on free-tier quota (429) failures.

## Measured results

All numbers below are from the dated measurement files linked in each row; values marked ~ are rounded from a single measurement run and are not guarantees for other devices or sessions.

| Measurement | Result | Source |
|---|---|---|
| On-device classification, adopted schema `{category, summary}` | Warm median **4,712 ms** (n=9 warm calls), warm max 5,304 ms, first call of the session (model already prepared) 5,276 ms — distinct from the fresh-profile cold start below | `docs/day2/A2-benchmark-10.md`, `docs/day2/A3-schema-decision.md` |
| On-device classification, fresh-profile real-use run | **7,610 ms**, `inferenceSource=on_device` | `docs/DAY3-REPORT.md:12` |
| Fresh-profile cold start (first visit, includes model download) | **~117 s** wall including download; download itself is progress-reported | `docs/DAY3-REPORT.md:12,18` |
| Cloud letter synthesis, `gemini-3.5-flash-lite`, 6 records | **1,787 / 2,003 / 2,722 ms** (1.8–2.7 s), 3/3 valid letters | `docs/freeze/FREEZE-TESTS-REPORT.md` Test 3 |
| Citation checks on the valid runs in the pre-freeze tests (Test 2: 5 valid of 10 attempts on 4 records; Test 3: 6-record sets, 3/3 valid for each of the two models tested there — gemini-3.5-flash-lite and gemini-4-hydrogen) | Nonexistent cited IDs **0**, uncited sentences **0**, date↔citation mismatches **0**; manual read found no invented facts in those runs | `docs/freeze/FREEZE-TESTS-REPORT.md` Tests 2–3 |
| Korean on-device batch, 12 memos | Digits/dates/amounts altered: **0 of 12** (meaning-shift and category-miss cases exist — see Limitations) | `docs/freeze/korean-batch-raw.json`, `docs/freeze/FREEZE-TESTS-REPORT.md` Test 1 |
| Firestore Rules emulator tests | **11/11 pass** | `docs/day2/DAY2-REPORT.md:23` (`A5`), `tests/firestore.rules.test.mjs` |
| Unit tests | **21/21** at the data-contract freeze (2026-11-16); **29/29** in the current tree after later fixes | `docs/DAY3-REPORT.md:7,24`; current tests in `src/domain.test.ts`, `src/regression.test.ts` |

Measurement conditions: real Chrome **157.0.8103.79** on desktop (an instrumented Chromium stub was identified and excluded from evidence during initial verification), deployed URL https://repair-ledger-6faaa.web.app unless a row says otherwise, all measured 2026-11-16. Note on the 10-attempt cloud run: only 5/10 attempts produced letters; the 5 failures were fetch/quota errors (429, free-tier 15 requests/min/model) during rapid repeated testing, not citation or schema failures (`docs/freeze/FREEZE-TESTS-REPORT.md` Test 2).

**Why this cloud model:** the frozen model was chosen by measurement, not by default (`docs/freeze/FREEZE-TESTS-REPORT.md`). `gemini-3.5-flash-lite` produced valid, citation-clean letters on the 6-record set in 1.8–2.7 s; `gemini-4-hydrogen` matched its citation quality but missed the 30 s latency criterion (42,975 ms median on the 4-record ×10 set; 2 of 3 six-record runs over 30 s); `gemini-3.8-flash` failed all 3 measured attempts (two 500 "high demand" errors and one 503).

## Limitations

- **Chrome desktop only.** Verified on Chrome 157.0.8103.79. The on-device model also requires a supported device with sufficient storage and memory, and an initial model download; the Chrome version alone does not guarantee that the model is available. Other browsers/profiles get the explicit unsupported guidance described above.
- **English memos are the intended input.** Date and location come from the user's own inputs, not from model extraction (the model-extracted alternative was measured and dropped: `docs/day2/A3-schema-decision.md`).
- **Korean input is not officially supported.** In the measured 12-memo on-device batch (Chrome 157, 2026-11-16), Korean memos were silently translated into English summaries: every digit, date and amount survived (0 altered), but one memo's meaning shifted (its summary said "work starting on November 12th" for a leak that had started then), one no-hot-water memo was categorized `unknown`, and in a supplementary run a landlord's name was omitted from the summary. The app therefore allows Korean input only with a non-blocking disclosure banner and a strengthened compare-before-save screen (highlighted dates/numbers/amounts/names next to the original). It is not presented as a Korean-supported product.
- **Four defect categories plus "unknown".** Categories are `heating`, `water_leak`, `mold`, `pest`, `unknown`; `unknown` means "needs review" and is never forced into a category. One record holds one category: a multi-defect memo keeps both facts in its summary but files under one category, the confirm screen warns about this, and the second defect should be filed as its own record.
- **The 311/HPD section is a static checklist**, last checked 2026-11-16 against NYC311 and HPD Online. It is general information, not legal advice. The cloud model is instructed not to write laws, statutes or agency text into the letter; such content exists only in this static list.
- **Cloud synthesis runs within a free-tier quota** (15 requests/min/model measured). Repeated generation in quick succession can return 429; the app surfaces this as a failure with a manual retry and preserves the selected records. There is no silent switch to another model. The free-tier quota applies to the project, so it is shared by everyone using the demo; repeated generation by multiple visitors in the same minute can exhaust it. Availability of the frozen cloud model (`gemini-3.5-flash-lite`) during the 2026-12-10–16 judging window is to be re-checked in early December (`docs/DATA-CONTRACT.md:40`).
- **Records live in one browser profile.** Anonymous sign-in persists in the same browser profile, so the ledger continues there; opening the app in a different browser or profile starts a separate, empty ledger under a new anonymous user, and there is no account recovery.
- **Offline scope:** after the model is ready, classification and saving to the on-device Firestore cache work with the network blocked (save state "sync pending", sync on reconnect). Reloading the page while offline is outside the stated scope (`docs/BUILD-PLAN.md:30`).

## Run it locally

Prerequisites: Chrome desktop (verified on 157.0.8103.79; the on-device model additionally requires a supported device with sufficient storage and memory and an initial model download) and your own Firebase project with AI Logic (Gemini Developer API provider), Anonymous Auth, Firestore, and App Check registered with a **reCAPTCHA Enterprise** site key (classic reCAPTCHA v3 keys do not work with the Enterprise provider used here — see `src/firebase.ts:30-31`). No project values are included in this repository; fill in your own.

```bash
git clone https://github.com/Oplo-Works/repair-ledger.git
cd repair-ledger
npm ci
cp .env.example .env.local   # PowerShell: Copy-Item .env.example .env.local
                             # then fill in your own project's values (variable names in .env.example)
npm run dev                  # http://localhost:5173
```

Other commands:

```bash
npm test            # unit tests (domain, state machine, guard, regression fixtures)
npm run test:rules  # Firestore Rules emulator tests (11 tests; requires a JRE via JAVA_HOME)
npm run build       # type-check + production build
```

On-device setup in your Chrome profile: enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, restart Chrome, open the app, and click **"1. Prepare on-device model"** (the first download takes on the order of minutes). For local development only, App Check can use the debug provider by setting `VITE_APPCHECK_DEBUG=true` in `.env.local`; never enable it in a production build and never commit a debug token.

Runtime hybrid call sites, for reviewers who want to verify the hybrid code paths: on-device classification in `src/ai.ts:78-101` (`classifyOnDevice`), cloud letter synthesis in `src/ai.ts:105-127` (`generateLetterInCloud`), model preparation in `src/ai.ts:68-71` (`prepareDeviceModel`).

Data handling reminder for anyone testing with their own input: after Consent 1 the record (including the original text) is synced to the Firestore project the app is configured with, and selected records are sent to the cloud model after Consent 2. Use the synthetic sample rather than real names, addresses or contact details when demoing.

## License

Apache-2.0. See `LICENSE`.
