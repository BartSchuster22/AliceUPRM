# Reward Config Editor Implementation Plan

> For Hermes: execute sequentially because this touches the same UPRM reward/admin-web surfaces across frontend and domain code.

Goal: replace the raw reward-config-only editing experience with a visual tier editor while preserving a raw JSON mode, and align backend reward semantics so fixed `currency: "credit"` works live.

Architecture: keep `tenantConfigDrafts.rewardConfig` as the persisted JSON source of truth in `apps/admin-web`, but add a dedicated reward-config editor module that can parse, normalize, and serialize the visual state back into the current JSON shape. On the backend, update `@uprm/rewards` so reward configs accept `credit` and reward postings use the config currency rather than rejecting based on purchase-event currency.

Tech Stack: React 18, Vite, TypeScript, Vitest, existing UPRM rewards domain package.

---

## Checkpoint A — Sighting + design

- Confirm current reward config editor is a raw textarea in `apps/admin-web/src/App.tsx`.
- Confirm reward backend currently validates 3-letter currencies and rejects `event.currency !== config.currency` in `packages/domain/rewards/src/config.ts` and `reward.service.ts`.
- Freeze UI requirements:
  - add/edit/delete tiers (`type`, `value`)
  - add tier depth below last tier
  - global enabled toggle
  - tier enable toggle where turning a tier off disables that tier and all deeper tiers in serialized JSON
  - fixed `currency: "credit"`
  - editable `settlementWindowDays`
  - raw JSON switch preserving manual editing

## Checkpoint B — Local implementation + local verification

### Backend

1. Add/adjust failing reward tests in `packages/domain/rewards/src/reward.service.test.ts` for:
   - `parseRewardConfig` accepting `currency: "credit"`
   - reward computation returning config currency (`credit`) even when event currency is fiat (e.g. EUR)
2. Update `packages/domain/rewards/src/config.ts` to accept `credit`.
3. Update `packages/domain/rewards/src/reward.service.ts` to stop rejecting event/config currency mismatch and emit `config.currency` onto computed rewards.
4. Run targeted rewards tests/build.

### Frontend

1. Add `apps/admin-web/src/reward-config.ts` with reward-config types, normalization, toggle, add/delete, and raw/visual serialization helpers.
2. Add failing helper tests in `apps/admin-web/src/reward-config.test.ts` covering:
   - add tier appends next depth
   - disabling a tier truncates serialized tiers from that depth downward
   - visual serialization always forces `currency: "credit"`
   - raw parse normalizes existing JSON into visual editor state
3. Add Vitest support to `apps/admin-web/package.json` and a small `vitest.config.ts` if needed.
4. Add `apps/admin-web/src/RewardConfigEditor.tsx` for the visual editor + raw toggle.
5. Replace the raw reward textarea block inside `apps/admin-web/src/App.tsx` with the new editor while keeping promoter/fraud raw editors unchanged.
6. Extend `apps/admin-web/src/styles.css` for tier rows, toggles, tabs, and read-only metadata.
7. Run targeted admin-web tests/build.

## Checkpoint C — Verification + closeout

- Run local verification bundle:
  - rewards tests/build
  - admin-web tests/build
- If clean, summarize the exact UX now available and call out any remaining live-deploy step if not performed.
