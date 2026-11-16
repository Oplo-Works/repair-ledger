# Day-1 Report — 2026-11-16 (Gate deadline: 11/15 night per BUILD-PLAN v2.1; measured 11/16)

## Verdict: STOP gate not cleared — blocked on Firebase project creation (owner action)
The vertical flow cannot be measured until a Firebase project exists. No gate below is marked passed on skeleton/diagnostic evidence. Code for the flow is built and unit-tested locally; all Firebase-dependent gates remain **blocked**, not passed.

Repo: https://github.com/Oplo-Works/repair-ledger (public, Apache-2.0 detected by GitHub API)
Deployed URL: **none yet** (no Firebase project → no Hosting).

## Gate table (0–6)
| Gate | Result | Measured evidence |
|---|---|---|
| 0. Devpost Rules read directly | **PASS** | Rules read in full at firebasehybridaihackathon.devpost.com/rules on 2026-11-16. Cross-check below. |
| 1. ONLY_ON_DEVICE real SDK call, `inferenceSource === ON_DEVICE` | **BLOCKED** | No Firebase project/config exists on this machine (no `.env.local`, no firebase CLI, empty workspace at start). Only diagnostic measured: `LanguageModel.availability()="downloadable"` in OpenCode's built-in Chromium 152 — explicitly **not** counted (plan: availability is not the criterion; also wrong browser/profile vs user's Chrome 157). |
| 2. Deployed-URL vertical flow (local 1 → confirm/save → cloud 1 → citation trace) | **BLOCKED** | Code complete locally (`src/ai.ts`, `src/main.ts`), build passes, 9 unit tests pass. No deployed URL exists, so per plan this is not a pass. |
| 3. App Check production (deployed domain, fresh profile, console enforcement) | **BLOCKED** | No project/domain yet. Code wires reCAPTCHA v3 provider; debug provider only on localhost + explicit local env opt-in, no token committed (secret scan: only prose mentions, no keys). |
| 4. Clean-profile criteria split | **PARTIAL (code-verified, not measured in user's Chrome)** | UI distinguishes three states measured locally with console errors = 0: config-missing (≠ unsupported), on-device unavailable → explicit unsupported guidance with official flag procedure, and (pending) on-device success. User's Chrome 157 clean/supported profiles not yet measured. |
| 5. Minimal offline experiment | **BLOCKED** | Depends on Gate 1 model readiness. Firestore persistent local cache is the single save path in code; no offline inference measured. |
| 6. Explicit cloud model + 1 synthesis, ID contract | **PARTIAL (code)** | Model explicitly named `gemini-3.8-flash` in `src/ai.ts`/`VITE_CLOUD_MODEL` (not the SDK default `gemini-3.5-flash-lite`); sentence-array `{text, sourceRecordIds[]}` validation in `src/domain.ts:validateLetter()` with unit tests (hallucinated ID → whole letter fails, no auto-retry). Synthesis itself not run — no project. |

## Gate 0 cross-check (Rules vs plan v2.1)
- Deadline: Rules header "Nov 30, 2026 @ 5:00pm EST" = §4 submission end Nov 30 2:00pm PT. Plan's "11/30 5:00 PM ET, submit 11/29 night" is consistent. **No discrepancy.**
- Required: Firebase AI Logic + Web(Chrome) with Gemini Nano via AI Logic — matches plan. Public repo + detectable open-source license — done (Apache-2.0). Runtime hybrid call must be in code, not only README — code exists, run pending Gate 1.
- Rules state "Firebase AI Logic requires App Check; debug tokens are accepted in submissions." Plan is stricter (production attestation, no debug token in repo) — kept; no conflict.
- Submission materials must be in English / app must at minimum support English — UI is English-primary (Korean only as fixed guidance text). Video ≤3 min, public YouTube — future checklist item, unchanged.
- Eligibility (§3) — user confirmed residence in an eligible region (2026-11-16).
- PII/production secrets must not be in repo/submission — secret scan clean; `.env*` gitignored except `.env.example`.

## SDK facts measured (firebase@13.3.0, pinned in package-lock.json)
- `InferenceSource.ON_DEVICE === "on_device"` (lowercase string) — `node_modules/@firebase/ai/dist/ai-public.d.ts:1668`. The badge shows the raw response value; the check compares against the constant, not the literal `"ON_DEVICE"`.
- Local: `npm run build` OK (vite 7.3.8), `npm test` 9/9 pass (`src/domain.test.ts`: state machine, edit-invalidation, ID contract, letter invalidation, timeline sort). Dev server renders with 0 console errors.
- Environment: Node 24.16.0, Chrome 157.0.8103.51 installed (≥139 OK), `gh` logged in as Oplo-Works. No `firebase`/`gcloud` CLI.

## Branch table: not invoked
No latency measured yet, so **no** latency branch (≤5s / 5–10s / …) is selected and nothing was pre-built for other branches. If Nano still cannot run via the SDK after the project exists, per plan: stop UI work, fix environment/SDK path first; if unresolved, re-evaluate submission viability (STOP gate).

## Next attempts (in order, after owner delivers `DAY1-USER-CHECKLIST.md` §B–C values)
1. Fill `.env.local`, run dev server in user's Chrome 157 (supported profile): click Prepare (starts Nano download — minutes), then classify sample memo; record `inferenceSource` raw value + latency. This is Gate 1.
2. Deploy to Firebase Hosting; repeat the full flow on the deployed URL (Gate 2), then fresh-profile App Check verification + console enforcement screenshot (Gate 3), clean no-flag profile check (Gate 4), offline experiment (Gate 5), one cloud synthesis with citation trace (Gate 6).

## Deferred to 11/16–19 (not touched today, per plan)
10-memo benchmark & schema A/B, cloud-synthesis measurement set, Korean-input reaction check, model lifecycle details, offline details (reconnect sync, 4-stage save-state transitions), Firestore Rules emulator tests (before any real personal records), 311/HPD checklist source re-verification.
