# 2026-04-26 Promoter consistency hardening

Goal: harden promoter admin UX and API so tenant/user/detail/promoter views all reflect the same live promoter truth.

Scope

- make promoter manual-create note truly optional
- make Promoters screen reflect active promoter state cleanly, not only raw application history
- show active promoters on Tenant detail
- show promoter memberships/status on User detail across tenants
- keep tenant-specific promoter type options consistent everywhere

Checkpoint A findings

- live source of truth for allowed promoter types is `tenant.config.promoterConfig.types`
- manual create DTO currently requires `note` even though UI intent is optional
- promoter list endpoint currently hangs off applications and can miss / misrepresent active promoter state
- tenant detail currently has no applied-promoters section
- user detail currently has no promoter-memberships section

Checkpoint B plan

1. Add RED tests:
   - manual-create DTO/controller path accepts missing note
   - promoter roster/list includes active profile state cleanly
   - tenant list/detail mapping includes active promoters
   - user detail mapping includes promoter memberships
2. Implement backend hardening:
   - optional note in DTO + API payload handling
   - merge active promoter profile + latest application for promoter screen rows
   - expose active promoter summaries on tenant payloads
   - expose promoter memberships on user detail payload
3. Implement admin-web hardening:
   - optional note submit path
   - Promoters list/detail uses active/profile-backed state fields
   - tenant detail renders applied promoters list
   - user detail renders promoter memberships list
4. Run targeted tests/builds and live verification.

Checkpoint C target proof

- green targeted tests/builds
- live Promoters screen shows active promoter truth
- tenant detail shows applied promoters
- user detail shows promoter memberships
- commit/push done
