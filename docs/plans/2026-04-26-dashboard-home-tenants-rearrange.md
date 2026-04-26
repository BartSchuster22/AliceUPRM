# Dashboard Home / Tenants rearrange plan

Goal: reshape admin-web so the main menu becomes Home and Tenants, with Home showing ecosystem reports by default and Tenants becoming a list-first detail flow.

Approach:

- Add `home` view and rename tenant-centric reporting behavior into that view.
- Support Home tenant filter defaulting to `all` by aggregating existing per-tenant report responses client-side.
- Make Tenants view list-only first; clicking a tenant opens a detail mode with Tenant details + Tenant config editor and a close/back action.

Implementation:

1. Replace nav items with Home + Tenants.
2. Add Home tenant filter state (`all` or specific tenant).
3. Add client-side reports aggregation helper using existing `fetchReports` API.
4. Extract reusable tenant detail/config section.
5. Change Tenants screen to:
   - list of tenants with name/currency/status
   - detail mode on click
   - close/back button in detail mode
6. Run admin-web tests/build.
