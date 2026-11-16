# Day-1 Report — 2026-11-16 final (Gate deadline: 11/15 night per BUILD-PLAN v2.1)

## Verdict: Gate cleared on the deployed URL — with two documented exceptions in §Notes
The full vertical flow was measured end-to-end on https://repair-ledger-6faaa.web.app in real Chrome 157. Repo: https://github.com/Oplo-Works/repair-ledger (public, Apache-2.0).

## Gate table (0–6)
| Gate | Result | Measured evidence |
|---|---|---|
| 0. Devpost Rules read directly | **PASS** | Rules read in full (firebasehybridaihackathon.devpost.com/rules). Deadline 11/30 5:00 PM ET = §4 2:00 PM PT — consistent with plan. Public repo + Apache-2.0 (GitHub API-detected), runtime hybrid calls in `src/ai.ts`, English-primary UI. Eligibility confirmed by user. |
| 1. ONLY_ON_DEVICE real SDK call | **PASS** | Chrome 157.0.8103.79, fresh profile (flags enabled): download 0→100%, `LanguageModel.availability()` downloadable→available, `generateContent` with `ONLY_ON_DEVICE` returned **`inferenceSource=on_device`** (actual response value), category `heating` correct, **9,822 ms**. |
| 2. Deployed-URL vertical flow | **PASS** | On https://repair-ledger-6faaa.web.app: local classify (21,175 ms cold / 10,186 ms warm) → Needs Review → Consent 1 → Confirm & Save to Firestore (Confirmed) → select 2 records → Consent 2 with send-preview → 1 cloud call → letter `Valid` → citation button click highlighted the exact source record; both records transitioned to `Included in Letter`; copy enabled. |
| 3. App Check production | **PASS** | Deployed domain + fresh CDP Chrome profile (no debug token): after switching to `ReCaptchaEnterpriseProvider` with a true Enterprise key, attestation succeeded (cloud request reached the model; final synthesis returned 200). User confirmed in console: Firebase AI Logic = **Enforced**. Two failures measured en route: classic v3 key → `401 token is invalid` (grecaptcha execute rejects a classic key under the Enterprise script; classic v3 registration is deprecated), and a cached old bundle — both diagnosed from network captures, not guessed. |
| 4. Clean-profile split | **PASS (criteria corrected by measurement)** | Supported profile (flags): local success = PASS (Gate 1). No-flag fresh Chrome 157 profile: Prompt API is present by default and also succeeded (`on_device`, 24,315 ms incl. download wait) — so "no-flag ⇒ unsupported" is false on Chrome 157. Simulated no-`LanguageModel` profile: explicit unsupported guidance rendered, and after the app-level guard (below) the request is blocked before any network call. |
| 5. Minimal offline experiment | **PASS** | Same CDP session (emulation verified: `fetch` failed, `navigator.onLine=false`): offline classify → `on_device`, 16,701 ms, `pest` correct → Confirm & Save without refresh → save state displayed **"sync pending (기기 반영 / 동기화 대기)"**. After reconnect the same record reached server-reflected (incidental observation; full Gate 8 remains deferred). |
| 6. Explicit cloud model + 1 synthesis, ID contract | **PASS with model-choice exception** | Synthesis succeeded: `inferenceSource=in_cloud`, **1,418 ms**, letter sentences each citing real record IDs (`b64db64b…`, `da59e860…`), `validateLetter()` passed. Model is explicitly named in code/env — see exception below. |

## Critical SDK finding (fixed, regression-tested)
firebase 13.3.0 silently falls back to the cloud when `LanguageModel` is absent, even in `ONLY_ON_DEVICE` mode: `chromeAdapterFactory` returns no adapter (node_modules/@firebase/ai/dist/esm/index.esm.js:1224-1231) and `callCloudOrDevice()` then runs the cloud call (:2562-2566). Measured live: a no-LanguageModel profile produced a cloud `generateContent` fetch. Fix: app-level pre-flight guard `assertOnDeviceCapable()` in `src/domain.ts` runs **before** any `generateContent()` call; re-measured — no cloud request is sent and the UI states so. Covered by unit tests (12/12 pass). Also: the OpenCode built-in Chromium 152 is an echo stub ("On-device model is not available in Chromium, this API is just echoing back the input") despite reporting `on_device`/100% download — it was **not** used as gate evidence; all gate measurements are from real Chrome 157.

## Latency branch selected
Measured on-device latencies: 9,822 / 21,175 (cold, new origin) / 10,186 / 7,369 / 16,701 (offline) / 24,315 ms (incl. download wait). Warm ≈7–10 s, cold first-call ≈16–24 s. Branch applied: **5–10 s path — strengthened progress UI** (elapsed-seconds indicator with cold-call notice, implemented in `src/main.ts`). No other branch was pre-built. Full cold/warm benchmark (Gate 9, 10 memos) remains 11/16–19 and may revisit this.

## Notes / exceptions
1. **Cloud model:** explicitly specified as `gemini-3.5-flash-lite` after measured failures: `gemini-3.8-flash` → 500 "high demand" ×2 (~30 s, ~157 s), `gemini-4-hydrogen` → 500 ×1. Flash-lite is named explicitly in `VITE_CLOUD_MODEL`/code (not an unnamed default), but it is the lightweight tier — re-verify a higher model and judging-window availability before the 11/19 freeze and in early December (plan §심사 기간 운영).
2. First OpenCode-Chromium "success" signals were discarded as stub artifacts (see SDK finding).
3. Firestore Rules are deployed and uid-scoped; emulator rule tests are still required before any real personal records are entered (deferred item, unchanged).

## Deferred to 11/16–19 (untouched, per plan)
10-memo benchmark & schema A/B (Gate 9), cloud-synthesis measurement set (Gate 10), Korean-input reaction (Gate 11), model lifecycle details (Gate 7), offline details beyond the minimal experiment (Gate 8), Firestore Rules emulator tests, Devpost text/video (11/28–29).
