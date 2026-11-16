# Day-2 Report (2026-11-16) — A (deferred verification) then B (flow completion)

All measurements on real Chrome 157 / deployed URL unless stated. Detail files are linked per item.

## A1. Cloud model revalidation → docs/day2/A1-cloud-model-compare.md
Same 2 confirmed records for every run; success = app-printed `Valid` (ID contract passed).
- gemini-3.8-flash: FAIL (Day-1 500 ×2; Day-2 503 after ~243 s). Rejected (0/3), not retried further.
- gemini-4-hydrogen: Valid 25,078 ms (6/6 citations) + final regeneration Valid 24,487 ms; Day-1 had one 500. (2/3 valid overall)
- gemini-3.5-flash-lite: Valid ×3, 1,248–1,418 ms, thinner letters (2–3 sentences).
- **Decision: `gemini-4-hydrogen` provisionally designated for the 11/19 freeze; one more rehearsal at freeze — if it fails, designation falls back to flash-lite.** No automatic model fallback in code.

## A2. 10-memo benchmark → docs/day2/A2-benchmark-10.md (+ benchmark-schemaA/B-raw.json)
- Warm median 4,712 ms (Schema B; A: 6,680 ms), warm max 5,304 ms, cold 5,276–15,304 ms. **STOP (warm median > 20 s) not triggered.**
- Failures preserved: multi-defect memo → single category (summary keeps both facts); instruction-style memo ("write a poem") ignored the instruction in both schemas; Schema-A suggested dates were non-ISO junk. No fabricated facts found.

## A3. Schema comparison → docs/day2/A3-schema-decision.md
**Adopted Schema B `{category, summary}`** (median −29%, equal-or-better accuracy, date/location stay UI-primary). `VITE_LOCAL_SCHEMA=full` retained only to reproduce the comparison.

## A4. Korean input → docs/day2/A4-korean-input.md
Recorded only: Korean heating memo classified correctly (`heating`, 4,662 ms) with a silently translated English summary. Decision (block/warn vs accept+disclose) deferred to the 11/19 freeze — written into the data contract as an open item.

## A5. Firestore Rules emulator tests → tests/firestore.rules.test.mjs (`npm run test:rules`)
**11/11 PASS**: owner CRUD on own tree only; other-uid read/write/update/delete all denied; unauthenticated denied; no access outside `users/`. Real personal records are now unblocked by this gate. (Emulator needs a JRE: `JAVA_HOME` must point at one; a portable Temurin 21 was used.)

## A6/A7. Lifecycle & offline → docs/day2/A6-A7-lifecycle-offline.md
Lifecycle states + download progress measured; unprepared-start classification waits and succeeds (4,217 ms) or guard-blocks; successful classify now flips the panel to Ready. Save-state stages 1–4 implemented from snapshot metadata and measured (offline "sync pending" → reconnect "server reflected"; stage 4 measured Day-1). Save no longer blocks the screen on the server ack.

## B8. Input/confirm/save flow (deployed, re-measured)
State machine, edit-invalidates-confirmation, delete, copy, and new **Download letter (.txt)** export all present. Re-verified live: editing a cited record flipped the Valid letter to `Invalidated`; re-confirm restored the record; letter regenerated Valid (hydrogen, 24,487 ms). Sample loader remains labeled synthetic.

## B9. Data contract → docs/DATA-CONTRACT.md (draft for 2026-11-19 freeze)
Record/letter schemas, state machine, guard rule, consent order, model designations, and three open decisions (Korean input, final cloud model, multi-defect handling) documented. Undocumented-by-11/19 = out of scope.

## Tests
- `npm test`: 12/12 unit tests pass (incl. no-silent-fallback guard regression tests).
- `npm run test:rules`: 11/11 emulator tests pass.
- Production build passes; hosting redeployed (https://repair-ledger-6faaa.web.app).
