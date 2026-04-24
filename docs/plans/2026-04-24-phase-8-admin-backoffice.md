# Phase 8 Admin Backoffice Implementation Plan

> For Hermes: use the subagent-driven-development skill when tasks are independent. For shared-file work, execute sequentially with tests after each slice.

Goal: complete Phase 8 by adding authenticated admin access, RBAC, audit logging, a served admin shell, and core operator screens/APIs.

Architecture: extend the existing Nest `admin-api` into the authenticated control plane for UPRM. Add `AdminUser` and `AuditLog` persistence in Prisma, validate admin JWTs against configurable settings, and serve a React/Vite SPA from the same domain. Prefer reusing existing domain services for tenant, identity, referral, ledger, and payout reads. Build missing admin-focused query surfaces only where necessary.

Tech Stack: NestJS 11, Prisma, Postgres, React, Vite, TypeScript, Jest, Playwright.

---

## P0 — Foundation

- Add Prisma models and migration for `admin_users` and `audit_logs`.
- Add JWT auth + RBAC to `admin-api`.
- Keep Stripe webhook route public-by-signature; protect actual admin routes.
- Add audit write path for admin mutations.
- Add admin bootstrap/seed path for first admin user if needed.

## P1 — Admin data APIs

- Tenant list/detail/update config.
- User search/detail.
- Wallet + ledger statement read APIs.
- Referral tree read API.
- Manual balance adjustment mutation with audit.
- Promoter applications/fraud/settlement placeholders or real flows depending on underlying domain readiness.

## P2 — Admin shell and screens

- Add React/Vite app.
- Serve built assets from `admin-api`.
- Tenant switcher + nav shell.
- Tenants/users/wallet/promoter/fraud/settlement pages.

## P3 — Verification

- Controller/service tests for auth, RBAC, audit.
- Frontend smoke/E2E coverage.
- Build, migrate, deploy, and live verification.
