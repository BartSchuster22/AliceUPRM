# Promoter screen redesign + manual add plan

Goal: redesign the Promoters screen so admins can manually add a promoter, filter/rank promoter cases, and open a promoter detail screen with promoter-only performance data.

Architecture:

- backend: extend promoter admin API with a manual-create/manual-approve path and a promoter-performance detail endpoint
- domain: allow manual promoter activation with configurable `promoterStatus` instead of hardcoded `promoter`
- frontend: replace the current two-pane application review table with a list-first flow and detail screen

Scope for this slice:

1. Manual add promoter
   - select user
   - select tenant (only tenants with promoter enabled in config)
   - select promoter-type
   - add button
2. Promoter list
   - filter by from tenant (all default)
   - filter by status
   - rank by time of activity / reward performance
   - rows show user name, tenant, status
3. Promoter detail
   - user, tenant
   - balance
   - promoter-only performance chart/data using `promoter_metrics_daily`
   - filter by range days and per tenant
   - close button top-right

Implementation order:

- add service/controller tests first
- add domain method for manual activation with custom promoterStatus
- add admin API endpoints:
  - POST /admin/promoter-applications/manual-create
  - GET /admin/promoter-applications/:id/performance
- add admin-web promoter helper for filters/ranking
- replace current promoter screen with list/detail flow
