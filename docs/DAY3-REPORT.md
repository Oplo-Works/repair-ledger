# Day-3 Report (2026-11-16)

## 1. Data contract frozen
`docs/DATA-CONTRACT.md` is now **FROZEN, freeze date 2026-11-16** (brought forward from 11/19). The three formerly open items are all closed in the document (Korean (b) implemented, cloud model frozen to `gemini-3.5-flash-lite`, multi-defect single-category rule kept); **no open items remain**. Post-freeze schema/contract changes are prohibited except external-factor changes (e.g. model unavailability in the judging window), which require a Change Log entry in the same file plus re-running the citation/quality verification. Change Log started in the document.

## 2. Local pipeline completion
- Regression tests added (`src/regression.test.ts`, measured fixtures): multi-defect memo (both facts preserved + deterministic multi-defect detection incl. Korean), instruction-style memo (classification only, prompt contract pinned), Korean meaning-shift case (highlighting + raw text survives edits byte-for-byte). Total unit tests: **21/21 pass**.
- Confirm screen now shows a multi-defect warning when the deterministic scan sees >1 defect type (verified live).
- **Two real defects found and fixed during fresh-profile verification:**
  1. In a brand-new profile, clicking classify without Prepare could wait indefinitely (>185 s measured) because `generateContent()` does not kick off the model download. The classify click now prepares the model first (gesture-gated), then classifies.
  2. Confirm & Save could persist a still-Processing record with empty text. `canConfirm()` (Needs Review + non-empty text) now guards the handler, with tests.
- State machine re-verified end-to-end on the deployed URL in a fresh profile: Draft → Processing → Needs Review → Confirmed → Included in Letter, with a Valid letter and citation highlight. Model-not-ready start measured: wall ~117 s including the fresh-profile model download; classify itself 7,610 ms (`on_device`).

## 3. Timeline
App-code sort (unchanged principle) plus month group headers and a record-count/status header. Verified on the deployed URL at 6 records (one `2026-11` group) and in the fresh profile; original + confirmed summary remain side by side on every card; selection → synthesis → `Included in Letter` transitions verified consistent.

## 4. Real-record readiness (procedure check, synthetic data only)
Fresh Chrome profile, first-visit walk on https://repair-ledger-6faaa.web.app: anonymous sign-in automatic → empty state → input → on-device classification → confirm (Consent 1) → save → letter (Consent 2) → citation trace. No blocking point found for a real user **provided they follow the model-preparation path now built into the classify button**; first visit in a new profile includes a model download of roughly 1–2 minutes. Server-side persistence of the fresh profile's data was proven directly (Firestore REST read-back for that uid: 1 record, status `Included in Letter`; token never left the page). No real personal records were used or handled.

## Demo material
`docs/demo-material.md` collects only measured cases (multi-defect, Korean meaning-shift, offline-failure → retry), each linked to its raw data file. Nothing staged.

## Gate regression check (STOP conditions)
On-device real call (`on_device`), letter citation checks, and Rules isolation all re-run after today's changes: unit 21/21, Rules emulator 11/11, deployed flow Valid. No previously passed gate is broken; no frozen-contract change was needed (both fixes are pipeline/UX behavior inside the existing contract).
