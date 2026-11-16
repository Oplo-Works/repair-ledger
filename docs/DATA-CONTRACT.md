# Data Contract — FROZEN

**Freeze date: 2026-11-16** (brought forward from the planned 2026-11-19; all pre-freeze tests completed and the three open items closed — see "Decisions closed" below; no open items remain).

Anything not documented here is out of scope (BUILD-PLAN v2.1). After this freeze, schema/contract changes are **prohibited**. The only exceptions are changes forced by external factors (e.g. the frozen cloud model becoming unavailable during the 2026-12-10–16 judging window); any such change must (1) be recorded in the Change Log at the bottom of this file with date, reason, and impact range, and (2) re-run the citation/quality verification from `docs/freeze/FREEZE-TESTS-REPORT.md` before use. Internal preference is never a valid reason to reopen this contract.

## Record (`users/{uid}/records/{id}`, Firestore — the only save path, offline persistence on)
| Field | Type | Rule |
|---|---|---|
| `id` | string (UUID) | Duplicate-prevention ID, generated client-side. |
| `rawText` | string | User's original memo. Always preserved, never overwritten by AI or edits. |
| `aiText` | string \| null | AI raw output (JSON string). Version 1 of the only 2 preserved versions. |
| `confirmedText` | string \| null | User-confirmed text. Version 2 of 2. Unconfirmed AI output never enters a letter. |
| `category` | `heating \| water_leak \| mold \| pest \| unknown` | `unknown` = "needs review", never forced. One category per record (measured limitation: a multi-defect memo files under one category; its summary keeps both facts — users file the second defect as its own record). |
| `occurredOn` | ISO date string, `""` if unknown | From UI input/code parsing only (primary). |
| `location` | string, `""` if unknown | From UI input only (primary). |
| `suggestedOccurredOn` / `suggestedLocation` | string \| null | **Deprecated 2026-11-16** (Schema B adopted): no longer produced. Old records may still carry them; they are never applied automatically. |
| `status` | `Draft \| Processing \| Needs Review \| Confirmed \| Included in Letter` | State machine in `src/domain.ts`; processing failure still lands in Needs Review with `rawText` intact. |
| `inferenceSource` | string \| null | Actual response value (e.g. `on_device`), never the requested mode. |
| `latencyMs` | number \| null | Measured round-trip of the AI call that produced this record. |
| `createdAt` | epoch ms | Timeline sorts by `occurredOn` (app code), unknown dates last, `createdAt` tiebreak. |

Edit rule: editing confirmed text moves the record to Needs Review (prior confirmation invalidated) and invalidates any letter citing it. Delete does the same invalidation, then removes the record.

## Local inference contract (frozen design)
- Mode `ONLY_ON_DEVICE` **plus** the app-level pre-flight guard (`assertOnDeviceCapable`, `src/domain.ts`) — required because firebase 13.3.0 silently cloud-calls when `LanguageModel` is absent. Weakening the guard is prohibited.
- Adopted schema (2026-11-16 Day-2 A3): `{category, summary}` only.
- A result is only accepted when `response.inferenceSource === InferenceSource.ON_DEVICE`; otherwise the record is kept as Needs Review with the raw text and an explicit failure message. No silent fallback, no auto-retry.
- Missing values stay `unknown`/`""` — the model never fills them.

## Letter (`users/{uid}/letters/{id}`)
- Cloud only, one call, explicit model (see below): input = selected Confirmed records only, after Consent-2 preview.
- Output contract: `{sentences: [{text, sourceRecordIds[]}]}` — sentence array. The app validates **every** cited ID exists and is Confirmed/Included (`validateLetter`); any failure discards the whole letter as a generation failure. No auto-retry. The model is instructed not to invent facts and not to write legal text (laws/statutes/agencies); 311/HPD content is a static allow-list in the page, labeled "not legal advice".
- Letter `status: Valid | Invalidated`. Editing/deleting any cited record sets it to Invalidated (regeneration required).
- Letter fields: `id, sentences, inferenceSource (must be in_cloud), latencyMs, model, status, createdAt`.

## Models (explicit names; FROZEN 2026-11-16 by pre-freeze tests, docs/freeze/FREEZE-TESTS-REPORT.md)
- Cloud (**frozen: `gemini-3.5-flash-lite`**, explicitly named in `VITE_CLOUD_MODEL`): citation checks were clean in every valid run (0 phantom IDs, 0 uncited sentences, 0 date mismatches; manual fact check clean) on 4-record ×10 and 6-record ×3 sets, at 1.7–9.1 s. Known limit: free-tier quota 429 (15 req/min/model) under rapid repeated generation — handled by the failure-recovery UX (failure state + manual retry + records preserved), never by silent model switching.
- `gemini-4-hydrogen` not frozen: citations equally clean (13/13 valid runs), but median latency 43 s on the 4-record set (acceptance: ≤30 s) and 2/3 runs >30 s on 6 records. `gemini-3.8-flash` rejected (0/3, 500/503). Re-check judging-window availability of the frozen model in early December.
- On-device: Gemini Nano via Chrome Prompt API through Firebase AI Logic (no model name is chosen client-side; availability is a Chrome/profile property).

## Consents & data boundaries (unchanged, in this order)
1. Save time: user consents that the original text syncs to Firestore. 2. Synthesis time: separate consent + exact send-preview. Disclosed boundaries (local inference / storage sync / synthesis send) are printed in the app and README. The phrase "data never leaves the device" must not appear anywhere.

## Change Log
- 2026-11-16: Initial freeze (this version). Basis: Day-1 gates, Day-2 A1–A7/B8–B9, pre-freeze Tests 1–3. No post-freeze changes yet.

## Decisions closed 2026-11-16 (pre-freeze tests)
- Korean input: **(b) allow + disclose** (owner decision). Non-blocking banner at input time with the fixed wording in `index.html#koreanBanner`; Korean originals get a strengthened confirm screen (dates/numbers/amounts/names highlighted next to the original); record cards always show original + user-confirmed English summary side by side. On-device calls are wrapped so an unsupported-language error (`NotSupportedError` etc.) degrades to guidance with the raw text preserved. Measured basis: `docs/freeze/korean-batch-raw.json` (Chrome 157, 2026-11-16) — digits/dates/amounts survived; one date-meaning shift (#2), one category miss (#12, no-hot-water → unknown), one name omission (supplementary case) are preserved as failure data. Not a "Korean-supported" product.
- Cloud model: frozen to `gemini-3.5-flash-lite` (Models section above).
- Letter failure recovery (model-independent, implemented): failure state is shown, selected records are preserved unchanged, no letter is saved, and a manual **Retry generation** button is offered. No auto-retry, no silent fallback/switching.
- Multi-defect memos: keep single-category rule + user files the second defect as its own record (documented limitation from Day-2 A2/F1).
