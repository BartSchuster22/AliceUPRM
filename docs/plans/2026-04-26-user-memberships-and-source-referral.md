# User memberships + source-referral chain implementation plan

Goal: make user detail show cross-tenant memberships and make source-user provenance behave as the fallback referral chain platform-wide.

Architecture: keep canonical identity at `User`, with one or more tenant-scoped `TenantUser` memberships. Add an effective referral-chain helper that composes explicit tenant referral ancestry first, then continues via `sourceTenantUserId` provenance links. Use that helper in admin user detail, public referral-tree endpoints, and reward ancestry loading. Default ordinary user creation without an explicit source to the current tenant owner user.

Tech stack: NestJS, Prisma, React/Vite admin-web, Vitest/Jest.

---

## Checkpoint A

- Inspect current `Tenant` / `TenantUser` provenance fields and confirm no schema change is required.
- Inspect admin user detail endpoint/UI and confirm memberships are missing.
- Inspect reward/referral runtime and confirm only tenant-scoped `referral_ancestry` is used today.
- Confirm live data counts for missing provenance before rollout.

## Checkpoint B

1. Add failing tests for source-referral fallback behavior.
2. Add `ReferralService.getEffectiveReferralChain(...)`:
   - explicit referral ancestry first
   - then continue via `sourceTenantUserId`
   - stop on null, duplicate, or maxDepth
3. Patch public `GET /v1/users/:id/referral-tree` to use effective chain.
4. Patch reward consumer ancestry loading to use effective chain and only schedule same-tenant beneficiaries.
5. Patch user creation default source logic:
   - if `sourceTenantUserId` omitted for ordinary users, use current tenant `ownerTenantUserId`
6. Extend admin user detail service/response with:
   - memberships list across the same canonical `userId`
   - effective referral chain
7. Patch admin-web types and user-detail UI to render:
   - source tenant
   - source user
   - memberships/services list
   - effective referral chain labels
8. Run targeted tests/builds.

## Checkpoint C

- Backfill any live tenant-users still missing source provenance using tenant owner fallback.
- Rebuild/restart affected services/apps.
- Live-proof:
  - admin user detail shows memberships + source chain
  - public referral tree endpoint returns source fallback chain
  - reward runtime still builds and starts
