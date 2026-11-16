# A3. Local schema comparison — decision (2026-11-16)

| | Schema A (was current): `{category, summary, suggestedOccurredOn, suggestedLocation}` | Schema B (alternative): `{category, summary}` |
|---|---|---|
| Warm median latency (same 10 memos, same profile) | 6,680 ms | **4,712 ms (−29%)** |
| Warm max | 7,896 ms | 5,304 ms |
| Category accuracy (10 cases, case 3 counted partial for both) | 8 ✓ / 1 partial / 1 over-conservative (case 6 → unknown) | **9 ✓ / 1 partial** |
| Extra-field quality | Suggested dates non-ISO ("Monday morning"); locations duplicated UI input | No extra fields — date/location remain UI/code-primary per BUILD-PLAN |
| Fact fabrication | None observed | None observed |

**Adopted: Schema B (minimal).** `src/ai.ts`: `LOCAL_SCHEMA_VARIANT` defaults to `"minimal"` (responseConstraint = category+summary); date/location come only from the user's UI inputs. Schema A remains reachable via `VITE_LOCAL_SCHEMA=full` solely to reproduce this comparison. This also matches the plan's rule that Nano extraction is assist-only — measured assist quality did not justify its latency or its junk values. (External reports of 35–50 s per item with complex schemas were not reproduced here; our measured delta is ~2 s median, still decisive at 10+ records.)
