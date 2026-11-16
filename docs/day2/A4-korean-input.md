# A4. Korean input reaction (2026-11-16, 5-minute test — recorded only, not solved)

Setup: deployed-model Chrome 157 profile, app on localhost, `ONLY_ON_DEVICE` + guard active (Schema B).
Input: `보일러가 고장나서 월요일부터 난방이 안 되고 집이 너무 추워요.`

Measured result:
- No error, no broken output, **no block**. Response in 4,662 ms with `inferenceSource=on_device`.
- Category: `heating` (correct). Confirmed-text suggestion: "The boiler broke down on Monday, and heating has been unavailable, making the apartment very cold." — i.e. the on-device model **silently translated** the Korean memo into an English summary.

Implication recorded for the 11/19 data-contract freeze (decision required there, not implemented in this test): the product spec is English-input-only, but today a Korean memo passes through and produces an English confirmed-text candidate while the preserved original remains Korean. Freeze must choose one and write it into the contract: (a) block/warn on non-English input, or (b) accept and disclose on-device translation. Per BUILD-PLAN, per-record translation calls are prohibited — option (b) would rely on the same single local call, but it is a product decision for the owner, not made here.
