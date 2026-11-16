# A1. Cloud model revalidation (2026-11-16, deployed URL, same 2 confirmed records)

Input (identical for all runs): records `b64db64b…` (heating, 2026-11-10, Bedroom) and `da59e860…` (water_leak, 2026-11-12, Bathroom), selected via the app UI on https://repair-ledger-6faaa.web.app. Success is only counted when the app prints `Letter (Valid)` — i.e. `inferenceSource=in_cloud` and every cited ID passed `validateLetter()`.

| Model (explicitly named) | Attempts measured | Result | Latency | Letter quality (same input) |
|---|---|---|---|---|
| gemini-3.5-flash-lite | Day-1 ×2, Day-2 ×1 | **Valid ×3** | 1,418 ms / 1,248 ms | 2–3 sentences; both records cited correctly, but facts compressed (greeting merged into a record sentence on one run). Citation accuracy 2/2 sentences. |
| gemini-3.8-flash | Day-1 500 ×2, Day-2 ×1 | **Fail ×3** | 503 "Deadline expired" after ~243 s (Day-2) | No letter produced. Not retried further per prompt (no repeated retries to burn time). |
| gemini-4-hydrogen | Day-1 500 ×1, Day-2 ×1 | **Valid ×1** | **25,078 ms** | 6 sentences, each cited to the correct record(s) (6/6), dates rendered correctly ("November 10, 2026"), clear opening/closing. Citation accuracy 6/6 sentences. |

## Decision (for the 11/19 data freeze)
- **Provisionally adopt `gemini-4-hydrogen`** as the explicitly designated cloud model: materially better letter structure and citation granularity, and it is a stable, no-billing-required model released 2026-11-12.
- Risk recorded: 1 of 2 measured hydrogen attempts failed with 500 "high demand", and the successful call took 25 s. At the 11/19 freeze rehearsal, run one more synthesis on the deployed URL: if hydrogen fails again, fall back the designation to `gemini-3.5-flash-lite` (3/3 valid, ~1.3 s) and record that as the frozen choice. No code-level automatic model fallback is added.
- `gemini-3.8-flash` is rejected for this project (0/3).
- Judging-window availability must be re-checked in early December (BUILD-PLAN §심사 기간 운영).
