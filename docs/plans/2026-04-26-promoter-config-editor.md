# Promoter Config Editor Implementation Plan

Goal: add a visual promoter-config editor to the tenant config panel with raw JSON mode preserved, supporting multiple promoter layers and editable bonus tiers per layer.

Architecture: keep `tenantConfigDrafts.promoterConfig` as the persisted JSON source of truth in `apps/admin-web`, but add dedicated promoter-config helper and editor modules parallel to the reward-config editor. Because promoter config is not yet consumed by a typed backend schema, define a forward-compatible JSON shape in the UI layer and serialize consistently.

Chosen JSON shape:

- `enabled: boolean`
- `types: Array<{ key: string; enabled: boolean; bonusTiers: Array<{ depth: number; type: 'percent' | 'flat'; value: string }> }>`

Interpretation:

- each promoter `type` = one promoter layer/class a user may be assigned to later
- each promoter layer contains bonus tiers by depth, added on top of standard reward tiers
- raw mode remains available for full manual editing

Tech stack: React 18, Vite, TypeScript, Vitest.

---

## Checkpoint A

- Confirm current promoter config is only a raw textarea in `apps/admin-web/src/App.tsx`.
- Confirm there is no current typed `promoterConfig` backend schema that would conflict.

## Checkpoint B

1. Add failing tests for promoter-config helpers.
2. Add `apps/admin-web/src/promoter-config.ts` helper module.
3. Add `apps/admin-web/src/promoter-config.test.ts`.
4. Add `apps/admin-web/src/PromoterConfigEditor.tsx` with:
   - visual/raw switch
   - add/edit/delete promoter type
   - per-promoter enabled toggle
   - nested bonus-tier add/edit/delete
5. Replace the raw promoter textarea in `App.tsx` with the new editor.
6. Extend CSS as needed for nested promoter rows.

## Checkpoint C

- Run targeted admin-web tests/build.
- If green, summarize the exact new promoter-config UX and proceed to next dashboard change.
