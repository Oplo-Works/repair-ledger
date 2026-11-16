# Devpost submission copy — Repair Ledger

Internal note: this file is the submission text only. Submission is manual, after user review. The video link is a placeholder until filming is done.

---

## Project name

Repair Ledger

## Tagline

Turn scattered repair notes into a traceable repair history — organized on-device, synthesized once in the cloud.

## Inspiration

Repair Ledger came from first-hand experience of a routine tenant problem. Repair issues get noted wherever is fastest at the time — a text message, a note on paper, a phone memo — and a few weeks later the dates blur together. When the same heating or leak problem happens again, there is no dated record showing it is a repeat, and writing a formal letter to a landlord feels like a bigger task than the repair request itself. The project started from that gap: scattered notes on one side, and the record you would need to write a clear, dated request on the other.

## What it does

A tenant types a short repair memo (for example, no heat since Monday) together with the date and location. The memo is classified and summarized on-device in Chrome into one of four categories — heating, water leak, mold, pest — or "unknown" if it does not clearly fit; it is never forced into a category. The tenant then sees the original memo next to the suggested summary and category, corrects anything that is wrong, and only after a save-time consent does the confirmed record go to storage, where records accumulate into a timeline sorted by occurrence date. When a letter is needed, the tenant selects confirmed records, sees an exact preview of what will be sent, gives a separate consent, and one cloud call produces a landlord letter in which every sentence carries citations to the records it is based on. Clicking a citation scrolls to and highlights the source record, showing the original text and the user-confirmed summary side by side. Citations are a review aid: they let the user check each sentence against its source record. Unconfirmed records can never enter a letter, and editing or deleting a cited record invalidates the letter until it is regenerated. The app also includes a static 311/HPD checklist, labeled as general information and not legal advice.

## How we built it

The app is a TypeScript/Vite web app using Firebase AI Logic's hybrid inference in the pinned firebase 13.3.0 SDK. Per-memo classification runs with `InferenceMode.ONLY_ON_DEVICE` (Gemini Nano via the Chrome Prompt API) with a structured `{category, summary}` output; date and location stay user-entered, because a measured schema comparison showed model-suggested dates came back as non-ISO text. Before any on-device call, a pre-flight guard checks that the Prompt API is actually present, and after the call the app accepts the result only if the response itself reports `inferenceSource=on_device` — that actual value is what the UI badge shows. Records are stored through Firestore offline persistence (the single save path) under Anonymous Auth, with uid-scoped Security Rules limiting each user to their own tree; App Check with reCAPTCHA Enterprise protects the AI Logic endpoint and does not replace those rules. The letter step is one `ONLY_IN_CLOUD` call with the model explicitly named as `gemini-3.5-flash-lite`, returning `{sentences: [{text, sourceRecordIds}]}`; app code validates that every cited ID exists and belongs to a confirmed record, and discards the whole letter if any check fails.

The cloud model was chosen by measurement, not by default. On a 6-record set, `gemini-3.5-flash-lite` produced valid letters in 3/3 runs at 1.8–2.7 s with no nonexistent cited IDs, no uncited sentences and no date-to-citation mismatches. `gemini-4-hydrogen` produced equally clean citations (13/13 valid runs) but a 43 s median latency on a 4-record set, above the 30 s acceptance limit set for the project, with 2 of 3 six-record runs over 30 s, so it was not frozen. `gemini-3.8-flash` was rejected after 0/3 attempts (500/503 errors).

## Challenges we ran into

**1. The SDK fell back to the cloud silently.** With firebase 13.3.0, requesting `ONLY_ON_DEVICE` was not enough: in the SDK source, the Chrome adapter factory returns no adapter when the Chrome Prompt API is absent, and the call path then runs the cloud call anyway. We confirmed this live — a profile without the Prompt API produced a cloud request despite the on-device-only mode. The fix is a pre-flight guard that refuses before any request is sent, plus a post-call check of the response's actual inference source, both pinned by unit tests.

**2. App Check moved off classic reCAPTCHA v3.** Registering App Check with a classic v3 key failed in production with 401 errors, because classic v3 registration is deprecated for App Check. We migrated to reCAPTCHA Enterprise (`ReCaptchaEnterpriseProvider`) and re-verified attestation on the deployed domain in a fresh profile without a debug token.

**3. A fresh profile could wait forever for classification.** In a brand-new Chrome profile, clicking classify without preparing the model first waited indefinitely (measured over 185 s), because that call path does not start the model download. The classify click now performs the gesture-gated model preparation first, then classifies; a fresh-profile end-to-end run including the download measured about 117 s.

**4. Korean input changed meaning while keeping the numbers.** English memos are the intended input, but we measured what actually happens with Korean: in a 12-memo on-device batch, no digit, date or amount was altered, yet one memo's meaning shifted ("the leak started Nov 12" became "work starting on Nov 12"), one no-hot-water memo was categorized "unknown", and a name was dropped in a supplementary run. Korean input is therefore not presented as supported. Instead the app shows a disclosure banner, highlights dates, numbers, amounts and names on the compare-before-save screen, always keeps the original next to the confirmed summary, and preserves the raw text if classification fails so the user can enter the record manually.

**5. One memo, two defects, one category.** A memo describing both mold and a leaking toilet keeps both facts in its summary but can only be filed under one category. Rather than hiding this, the confirm screen runs a deterministic keyword check, warns when a memo appears to mention more than one defect type, and tells the user to file the second defect as its own record. The measured case is kept as a regression fixture.

## Accomplishments that we're proud of

Across the valid runs of the pre-freeze citation tests, the deterministic checks came back clean: 0 nonexistent cited IDs, 0 uncited sentences, 0 date-to-citation mismatches, and a manual read found no invented facts. The Firestore Security Rules pass 11/11 emulator tests (owner-only access, cross-user and unauthenticated access denied). Failures we measured were kept as data and fixed into the test suite as regression fixtures — the multi-defect memo, the instruction-style memo that tried to turn classification into a poem request, and the Korean meaning-shift case — instead of being deleted. The cloud model freeze itself came out of that process: three candidate models measured on identical inputs, with the faster model winning on the stated latency criterion while citation quality was equal.

## What we learned

The main lesson was the gap between asking for local inference and proving it. A requested inference mode, and even an availability check, do not establish where a call actually ran; the response's own inference source does, and in this SDK the absence of the on-device adapter was quietly routed to the cloud. Verifying the actual source, and blocking beforehand when the device cannot run the model, became a core part of the design rather than a diagnostic. We also learned that the confirmation step is where trust in the record is actually created: the model's output is a suggestion, the original text is never overwritten, and the letter can only cite what the user has checked. That shaped the state machine, the edit-invalidates-letter rule, and the failure handling more than any single model choice.

## What's next

After the judging period, the direction is a small real-use pilot to see how the confirm-before-save flow holds up with tenants' own records, and an evaluation of whether the same hybrid split makes sense beyond Chrome desktop. No schedule is attached to either.

## Built with

firebase, firebase-ai-logic, gemini-nano, chrome-prompt-api, gemini-3.5-flash-lite, cloud-firestore, firebase-authentication, firebase-app-check, recaptcha-enterprise, firebase-hosting, typescript, vite, vitest

## Links (for the submission form fields)

- **Demo URL:** https://repair-ledger-6faaa.web.app
- **GitHub repository:** https://github.com/Oplo-Works/repair-ledger
- **Video URL:** VIDEO_URL_TBD
