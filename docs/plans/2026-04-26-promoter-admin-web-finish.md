# 2026-04-26 Promoter admin-web finish

## Goal

Finish the real Promoters admin dashboard flow in `/srv/uprm` with backend-supported data:

- list-first promoter screen with tenant/status/rank controls
- manual add promoter form
- selectable promoter type/status during approval/manual activation
- row click -> promoter detail screen
- promoter-specific performance panel using `/admin/promoter-applications/:id/performance`
- close/back flow
- preserve real backend behavior, no fake UI

## Checkpoint A findings

- Backend already has manual create and performance endpoints.
- Admin-web currently still shows the old applications table/detail only.
- Current promoter API payload does not expose a promoter type/status field suitable for the new UI.
- Admin-web already has helper groundwork in `src/promoter-browser.ts` but it is too small for the final screen.

## Checkpoint B plan

1. Add RED tests for promoter helper behavior and controller mapping needed by the new UI.
2. Extend promoter admin API payload with current promoter status metadata.
3. Expand `promoter-browser.ts` to build rich rows and performance summaries.
4. Rework `App.tsx` promoter state/UI:
   - filters
   - manual add form
   - list/detail toggle
   - promoter type selection for approve/manual add
   - performance chart/detail
5. Add CSS for the new promoter layout.
6. Run targeted tests/builds for `@uprm/promoter`, `admin-api`, and `admin-web`.

## Checkpoint C target proof

- green targeted tests/builds
- served admin bundle contains the new promoter screen strings
- ready for live deploy proof next
