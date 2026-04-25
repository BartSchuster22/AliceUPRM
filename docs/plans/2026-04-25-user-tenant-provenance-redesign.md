# UPRM User/Tenant Provenance Redesign

## Goal

Make provenance first-class so every entity involved in growth/referral chains is represented as a user, including UPRM itself as `user0`.

## Canonical rules

1. Every tenant is also a user.
2. Not every user is a tenant.
3. UPRM itself is represented as the root user `user0`.
4. `user0` is the only allowed exception with no source/referral user.
5. Every other tenant/user entity must always have a source user.
6. User detail must show:
   - source tenant
   - source user
   - current tenant
   - current tenant-user record
7. Example chain:
   - `user0` (UPRM root)
   - `userX` (tenant PSI as user) came from `user0`
   - `userX2` joined PSI and came from `userX`

## Live model gap

Current live model supports only tenant-scoped users and tenant-scoped referral edges.
It does NOT model:

- tenant as user
- root UPRM user0
- mandatory source user on every non-root entity
- user detail provenance fields
- cross-context provenance for tenant bootstrap

## Proposed additive model

### Tenant

Add provenance/ownership fields:

- `ownerTenantUserId String?`
- `sourceTenantId String?`
- `sourceTenantUserId String?`
- `isSystemTenant Boolean @default(false)`

Meaning:

- `ownerTenantUserId`: the tenant's canonical tenant-as-user record
- `sourceTenantId`: tenant context from which this tenant originated
- `sourceTenantUserId`: source user who brought this tenant in
- `isSystemTenant`: marks UPRM root tenant

### TenantUser

Add provenance/entity fields:

- `entityType String @default("person")` // person | tenant | system
- `sourceTenantId String?`
- `sourceTenantUserId String?`

Meaning:

- `entityType=system` for `user0`
- `entityType=tenant` for tenant-as-user records like PSI/userX
- `entityType=person` for ordinary users
- `sourceTenantId` / `sourceTenantUserId` capture canonical provenance for user detail

## Runtime rules

### Root bootstrap

Ensure one root system tenant exists for UPRM plus one root system tenant-user:

- root tenant slug: `uprm`
- root tenant-user external id: `user0`
- entityType: `system`
- no source user

### Tenant creation

Creating a tenant must also create its tenant-as-user record.
Default source for tenant creation:

- source tenant = UPRM root tenant
- source user = `user0`
  unless an explicit source is provided later.

### User creation in tenant

Creating a tenant user must require provenance.
Default safe behavior for first pass:

- accept explicit `sourceTenantUserId`
- infer `sourceTenantId` from that source record
- reject creation for non-root users if no source is supplied

## UI changes

Admin user detail must show:

- entity type
- source tenant id / name
- source tenant-user id
- source user display label
- whether this record is the tenant owner user

## Execution order

1. Add additive schema fields.
2. Create migration.
3. Add bootstrap/ensure-root logic for UPRM root tenant + `user0`.
4. Patch tenant creation to create tenant-as-user and attach source user.
5. Patch user creation to require/infer source user provenance.
6. Extend admin user detail response.
7. Extend admin-web user detail panel.
8. Backfill existing live rows where possible:
   - create UPRM root tenant and `user0`
   - map existing tenants to owner tenant-user records
   - default existing tenants to source `user0`
   - identify unresolved ordinary users for manual reconciliation if needed

## Risks

- Cyclic tenant <-> tenantUser creation if relations are made hard-required too early
- Existing data backfill ambiguity for already-created users without source provenance
- Existing referral edges remain tenant-scoped and may need later harmonization with provenance semantics

## First implementation slice

Use additive nullable fields first, backfill live data, then tighten invariants in application logic before any DB-level NOT NULL enforcement.
