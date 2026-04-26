# Fraud Config Editor Implementation Plan

Goal: replace the raw tenant `fraudConfig` textarea with a visual editor plus raw JSON mode, following the existing reward/promoter editor pattern.

Architecture: keep `tenantConfigDrafts.fraudConfig` as the persisted JSON source of truth in `App.tsx`. Add `fraud-config.ts` for parse/normalize/serialize helpers and `FraudConfigEditor.tsx` for the visual/raw switch. Match the live backend fraud config shape from `packages/domain/fraud/src/config.ts` and `types.ts` so the editor enforces the real fields and defaults.

Tech stack: React 18, Vite, TypeScript, Vitest.

---

## Checkpoint A

- Confirm fraud config is currently raw-only in `apps/admin-web/src/App.tsx`.
- Confirm real fraud config fields/defaults from `packages/domain/fraud/src/config.ts`.
- Keep a `Raw code` mode exactly like reward/promoter editors.

## Checkpoint B

1. Create failing helper tests in `apps/admin-web/src/fraud-config.test.ts`.
2. Add `apps/admin-web/src/fraud-config.ts` with:
   - fixed signal key list
   - safe defaults matching backend fraud config
   - normalize/serialize helpers for booleans and numeric thresholds
3. Add `apps/admin-web/src/FraudConfigEditor.tsx` with:
   - visual/raw switch
   - global enabled toggle
   - numeric inputs for threshold/window fields
   - editable signal weight inputs
4. Replace the raw fraud textarea in `apps/admin-web/src/App.tsx` with the new editor.
5. Extend `apps/admin-web/src/styles.css` only as needed for readability.
6. Run targeted admin-web tests/build.

## Visual editor scope

Fields to edit visually:

- enabled
- caseThreshold
- scoreWindowHours
- clusterWindowDays
- refundRatioThreshold
- refundRatioWindowDays
- velocityWindowMinutes
- velocityReferralCountThreshold
- signalWeights:
  - referral_velocity
  - self_referral_attempt
  - same_ip_multiple_signups
  - same_payment_fingerprint
  - high_refund_ratio_cluster

## Checkpoint C

- Rebuild admin-web live bundle.
- Restart/reload the serving path if needed.
- Prove live that fraud config now supports:
  - visual editing
  - raw JSON switch
  - save path unchanged
