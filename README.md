# Repair Ledger

NYC tenant repair records: short English memos are classified **on-device** in Chrome (Gemini Nano via Firebase AI Logic), reviewed and confirmed by the tenant, saved, and later combined in **one cloud synthesis** into a landlord letter where every sentence cites its source records.

Built for [#BuildHybridAI 2026](https://firebasehybridaihackathon.devpost.com/) — Web/Chrome track. Plan: `docs/BUILD-PLAN.md` (v2.1).

## Hybrid inference — where it actually runs (runtime code, not just imports)
- On-device classification: `src/ai.ts` → `classifyOnDevice()` uses `getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { promptOptions: { responseConstraint } } })`. If the device model is unavailable the SDK throws — there is **no silent cloud fallback**. The app then verifies `result.response.inferenceSource === InferenceSource.ON_DEVICE` (actual value `"on_device"`) and shows it as a badge with latency.
- Cloud letter: `src/ai.ts` → `generateLetterInCloud()` uses `InferenceMode.ONLY_IN_CLOUD` with an **explicitly named model** (`gemini-3.5-flash-lite`, set via `VITE_CLOUD_MODEL` — explicitly specified, not left as an unnamed default; chosen on 2026-11-16 after measured 500 "high demand" failures from `gemini-3.8-flash` ×2 and `gemini-4-hydrogen` ×1, while flash-lite succeeded in 1,418 ms. Model choice must be re-verified before the 11/19 data freeze and again in early December for the judging window). Output is structured `{sentences:[{text, sourceRecordIds[]}]}`; `src/domain.ts:validateLetter()` checks every cited ID exists and is Confirmed — any failure discards the whole letter (no auto-retry).
- Model download/lifecycle: `prepareDeviceModel()` in `src/ai.ts` (button-triggered, per Chrome's user-activation requirement, with download progress).

## Data boundaries (disclosed exactly)
1. **Local inference:** memo text is processed on this device only (ONLY_ON_DEVICE).
2. **Storage/sync:** on Confirm & Save, the record *including the original text* is sent to Firestore (Firebase) and synced across devices. We do **not** claim your text never leaves the device.
3. **Letter synthesis:** only records you explicitly select are sent to Gemini in the cloud, after a separate preview + separate consent (Consent 2). Saving uses a separate earlier consent (Consent 1).

Save path is **Firestore offline persistence only** (no custom sync engine/service worker). Access control: anonymous Auth + uid-scoped Firestore Security Rules (`firestore.rules`). App Check (reCAPTCHA v3) protects the AI Logic endpoint; it does not replace the uid rules.

State machine: `Draft → Processing → Needs Review → Confirmed → Included in Letter`. Processing failure preserves the raw text as Needs Review. Editing a record invalidates its confirmation and any letter citing it; deleting does the same.

## Run it (judges)
Prerequisites: Chrome Desktop 139+ (verified on Chrome 157), a Firebase project with AI Logic (Gemini Developer API), Anonymous Auth, Firestore, and App Check (reCAPTCHA v3) enabled.

```bash
npm ci
cp .env.example .env.local   # fill in your Firebase web config + reCAPTCHA v3 site key
npm run dev                  # http://localhost:5173
npm test                     # domain/state-machine/ID-contract unit tests
npm run build
```

On-device setup: enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, restart Chrome, open the app, click **“Prepare on-device model”** (first download takes several minutes). In a profile without that setup the app shows explicit unsupported guidance — that is the expected result there; it never silently falls back to the cloud. English memo input only; UI guidance is English with fixed Korean guidance text (no per-record translation calls).

Sample data in the app is synthetic and labeled as such. Do not put real names/addresses/contact details in records you demo.

## Status
Day-1 vertical slice (2026-11-16): local scaffold builds and unit tests pass. Firebase-project-dependent gates (real ON_DEVICE call, deployed URL flow, production App Check, offline experiment) are tracked in `DAY1-REPORT.md` and are **not** claimed until measured on a deployed URL with a real project.
