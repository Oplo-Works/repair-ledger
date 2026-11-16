# Pre-freeze tests report (2026-11-16, Chrome 157.0.8103.79, deployed URL unless noted)

Prompt/letter text was **not** changed during Tests 2–3, so all numbers are comparable. One measurement was caught and discarded: the first "lite ×10" run actually executed hydrogen from a cached bundle (24–62 s, `model=gemini-4-hydrogen` in its own output). The script now hard-reloads and aborts on model mismatch; the discarded run is preserved as `hydrogen-10runs-4records-raw.json` and used only as hydrogen data.

## Test 1 — Korean batch (12 memos, on-device) → `korean-batch-raw.json`
Priority check = mutation of dates/numbers/proper nouns in the English summary.
| # | Check | Result |
|---|---|---|
| 1 | Nov 10 · 3F · unit 302 · landlord 김철수 | All preserved ("November 10th", "302", "3rd floor", "Kim Cheol-soo") · heating ✓ |
| 2 | $450 · Nov 12 | Digits preserved; **meaning shifted**: leak-start Nov 12 became "work starting on November 12th" ⚠ |
| 3 | negation (smell not severe) | Preserved correctly · mold ✓ |
| 4 | cockroaches/kitchen | Singularized ("A cockroach has been…") — minor number softening · pest ✓ |
| 5 | works BUT not warm | Distinction preserved exactly · heating ✓ |
| 6 | not working at all | ✓ heating |
| 7 | EN/KO mixed, Nov 13 | ✓ water_leak |
| 8 | two defects, Nov 8 | Date ✓, both facts in summary; category mold only (single-category limit) |
| 9 | elevator (out of scope) | unknown ✓ |
| 10 | 2 buckets/day, Nov 5 | Both preserved · water_leak ✓ |
| 11 | Michael · Nov 3 · $200 · door lock | All preserved · unknown ✓ |
| 12 | no hot water, 2 weeks | Facts preserved; **category `unknown` (miss — should be heating)** ⚠ |
| S | supplementary (impl. verification): 302호·김철수·$300 | Summary **omitted the landlord's name** (omission, not mutation) ⚠ |

Judgment: no digit/amount was ever altered; the risks are meaning-shift (#2), omission (S), and category misses (#8/#12). These are manageable by the Decision-1 measures as implemented (strong banner + highlighted compare screen), and they justify keeping that strengthen­ing rather than relaxing it. Decision 1 stands; this product is not marketed as Korean-supported.

## Test 2 — lite citation accuracy ×10 (same 4 records) → `lite-10runs-raw.json`
- Valid runs: **5/10**. Successful-run latencies: 1,677–9,133 ms (median 3,085 ms).
- Failures: 5 fetch errors; the fully captured one is **429 free-tier quota** (`generate_content_free_tier_requests`, 15/min/model) caused by rapid repeated testing — not a citation or schema failure. (Others were captured truncated; classified as fetch errors in the same quota window, not as model-content failures.)
- Deterministic checks on valid runs (29 sentences): **phantom IDs 0, uncited sentences 0, date↔citation mismatches 0**. Manual read of every unique sentence: no invented facts.

## Test 3 — multi-record (6 records), both models → `test3-{hydrogen,lite}-6records-raw.json`
| Model | Valid | Latency | Sentences | Phantom | Uncited |
|---|---|---|---|---|---|
| gemini-4-hydrogen | 3/3 | 28,737 / 48,688 / 53,084 ms | 21 | 0 | 0 |
| gemini-3.5-flash-lite | 3/3 | 2,003 / 2,722 / 1,787 ms | 21 | 0 | 0 |
Letter quality at 6 records is comparable (hydrogen adds per-sentence dates; lite covers the same facts). Hydrogen failure mode when it fails (Day-1/2): 500/503 capacity + deadline — i.e. capacity/timeout class, never schema/ID failures. The 6-record set also contained a new failure kept as-is: a "no hot water" memo classified `unknown` with a hedging summary (user-correctable at confirm).

## Verdict (rules applied as written)
- Lite citations are clean (phantom 0, fact mismatch 0 across Tests 2–3) → **cloud model frozen: `gemini-3.5-flash-lite`** (explicitly named). Hydrogen would also fail its own acceptance bar on latency (4-record median 42,975 ms > 30 s) despite 13/13 valid runs.
- Failure-recovery UX implemented and measured independent of model choice: offline generation → failure message + "records preserved" note + **Retry generation** button → after reconnect, retry produced a Valid letter (1,686 ms). No auto-retry, no silent switching.
- Decision 1 (Korean allow + disclose) implemented: input-time banner with the fixed wording, Korean confirm screen highlighting dates/numbers/amounts/names beside the original, record cards showing original + confirmed English summary side by side, `NotSupportedError`-class errors degrading to guidance with raw text preserved. Verified live on the deployed URL (banner toggles with Hangul input; confirm screen rendered 4 highlighted facts).

## Files
- `docs/freeze/korean-batch-raw.json`, `lite-10runs-raw.json`, `hydrogen-10runs-4records-raw.json`, `test3-hydrogen-6records-raw.json`, `test3-lite-6records-raw.json`
- Contract updated: `docs/DATA-CONTRACT.md` (Decisions closed 2026-11-16).
