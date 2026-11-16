# Data Contract — DRAFT for the 2026-11-19 freeze (prepared 2026-11-16)

Anything not documented here by 2026-11-19 is out of scope (BUILD-PLAN v2.1). Changes after the freeze require a written note in this file with date and reason.

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

## Models (explicit names; re-verified 2026-11-16, Day-2 A1)
- Cloud (designated for the freeze, provisional): **`gemini-4-hydrogen`** — 1/2 measured attempts valid (25,078 ms, best citation quality); if it fails at the 11/19 freeze rehearsal, designation falls back to `gemini-3.5-flash-lite` (3/3 valid, ~1.3 s). `gemini-3.8-flash` rejected (0/3). Re-check judging-window availability in early December.
- On-device: Gemini Nano via Chrome Prompt API through Firebase AI Logic (no model name is chosen client-side; availability is a Chrome/profile property).

## Consents & data boundaries (unchanged, in this order)
1. Save time: user consents that the original text syncs to Firestore. 2. Synthesis time: separate consent + exact send-preview. Disclosed boundaries (local inference / storage sync / synthesis send) are printed in the app and README. The phrase "data never leaves the device" must not appear anywhere.

## Open decisions due by the freeze (2026-11-19)
- Korean input (Day-2 A4): today it is silently translated by the on-device model. Choose (a) block/warn on non-English input, or (b) accept + disclose. Not decided on 2026-11-16.
- Final cloud model confirmation after one more hydrogen rehearsal (above).
- Multi-defect memos: keep single-category rule + user files second record, or split at input time. Current contract keeps the former.
