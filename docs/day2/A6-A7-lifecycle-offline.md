# A6/A7. Model lifecycle UI & offline save-states (measured 2026-11-16, deployed URL)

## A6 lifecycle
- States rendered on the first screen: `Not prepared → (click, user gesture only) Preparing with Download progress: n% → Ready`; unsupported profiles get the explicit guidance panel (verified Day-1/Day-2, incl. simulated no-`LanguageModel`).
- Input while Not prepared (measured): memo typed, classification clicked **without** Prepare → the `ONLY_ON_DEVICE` call waits for the (already downloaded) model and succeeds (`on_device`, 4,217 ms, heating). If the model still needs downloading, the same click path waits for the download (Day-2 no-flag profile: 24,315 ms incl. wait); if the device cannot run it, the pre-flight guard blocks before any cloud call.
- Fix made: a successful classification now also flips the panel to `Ready` (previously it stayed "Not prepared" after an unprepared-start success).

## A7 save-state 4 stages (Firestore offline persistence, single save path)
Mapping implemented from snapshot metadata + errors: 1) device reflected → 2) sync pending (`hasPendingWrites`) → 3) server reflected → 4) sync failed (listener/save error). Save is non-blocking: the Confirm handler reflects the record on-device immediately and the snapshot listener reports later stages; the screen never waits for the server ack.

Measured on the deployed URL (Chrome 157, CDP session):
- Offline (network emulation verified: fetch FAILED, onLine=false): classify `on_device` 5,944 ms (`pest`) → save → status showed stage 2 "sync pending" and the record was usable in the list without refresh.
- Reconnect: status transitioned to server-reflected (stage 3). Stage 4 was measured on Day-1 (permission-denied before rules were deployed: listener error + "Save failed" surfaced, raw record kept as Needs Review).
- B8 invalidation re-verified in the same session: editing the heating record cited by the Valid hydrogen letter immediately flipped the letter to `Invalidated`; re-confirming restored `Confirmed`; the other record stayed `Included in Letter`.
