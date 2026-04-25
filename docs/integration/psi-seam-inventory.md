# PSI Seam Inventory for Phase 10

Status: canonical PSI seam inventory used for the first real Phase 10 execution pass.
Primary PSI repo verified during planning:

- `/srv/psi/repos/AliceClaw`

Repo state at inventory time:

- branch: `main`
- remote: `git@github.com:BartSchuster22/AliceClaw.git`
- status: `ahead 1, behind 1`, plus multiple modified and untracked files

Implication:

- PSI is an active mixed worktree
- Phase 10 seam work must be split carefully into coherent checkpoints
- do not pile new SDK migration work blindly into unrelated dirty PSI changes

---

## 1. Verified existing PSI-side UPRM seam

The seam already exists in code, but it is still partial and mixed with PSI-local fallback ownership.

Verified files:

- `apps/backend-api/src/integrations/uprm/client.ts`
- `apps/backend-api/src/integrations/uprm/billing.ts`
- `apps/backend-api/src/integrations/uprm/identity.ts`
- `apps/backend-api/src/integrations/uprm/referrals.ts`
- `apps/backend-api/src/integrations/uprm/types.ts`
- `apps/backend-api/src/integrations/uprm/config.ts`
- `apps/backend-api/src/integrations/uprm/index.ts`

What this means:

- PSI has already started introducing the seam the roadmap called for
- the next job is not inventing the seam from zero
- the next job is standardizing and externalizing it into the reusable UPRM-side SDK package, then rebinding PSI to that package cleanly

---

## 2. Seam classification by PSI entrypoint

### A. Auth / registration / login

Primary file:

- `apps/backend-api/src/auth.ts`

Verified current state:

- `/auth/register` already calls `uprmIdentity.registerOrLinkUser(...)`
- `/auth/login` already calls `uprmIdentity.authenticateUser(...)`
- PSI still signs its own JWTs and owns refresh-cookie/session issuance locally

Classification:

- state: partially backed by UPRM seam
- PSI still owns: session/token bridging
- UPRM seam currently owns or influences: user register/link + login credential check path

Phase 10 implication:

- auth is not a greenfield seam anymore
- the first migration target is the client layer under it, not necessarily the route shape itself

### B. User profile / subscription reads

Primary file:

- `apps/backend-api/src/modules/user/routes.ts`

Verified current state:

- `/user/profile` already calls `uprmIdentity.getUserProfile(...)`
- `/user/subscriptions` already calls `uprmIdentity.getUserSubscriptionSummary(...)`
- instance lifecycle routes remain PSI-native and should stay PSI-native
- profile patch still writes PSI-local tables directly

Classification:

- profile read: partially backed by UPRM seam
- subscription read: partially backed by UPRM seam
- profile write: still PSI-local
- runtime/instance control: intentionally PSI-local

Phase 10 implication:

- the read side is already crossing the seam
- the SDK must support these read contracts early
- instance lifecycle must not be moved into UPRM

### C. Checkout creation

Primary file:

- `apps/backend-api/src/modules/orders/routes.ts`

Verified current state:

- `/orders/create` imports `uprmBilling` and `UprmHttpError`
- route chooses UPRM-backed checkout when seam config is available
- route preserves upstream HTTP status/message on UPRM checkout failures
- route still inserts PSI-local `orders` rows before checkout creation
- route still falls back to a dev mock checkout URL if neither UPRM seam nor local Stripe path is configured

Classification:

- state: partially backed by UPRM seam
- UPRM already participates in checkout ownership
- PSI still owns local order row creation and fallback behavior

Phase 10 implication:

- checkout is one of the most mature current seam points
- the reusable SDK must cover this path early

### D. Billing/webhook ownership

Primary evidence from earlier repo classification and git dirty state:

- `apps/backend-api/src/modules/billing/stripe-adapter.ts`
- `apps/backend-api/src/modules/billing/referral-jobs.ts`
- git status shows `apps/backend-api/src/modules/billing/stripe-adapter.ts` modified

Verified current state:

- PSI billing module is still active and currently dirty in the working tree
- local billing ownership has not been fully retired from PSI
- earlier live work already retired PSI public Stripe ingress at the repo level, but the PSI repo remains mid-transition

Classification:

- state: partially backed by UPRM seam, still mixed with PSI-local ownership

Phase 10 implication:

- webhook and billing migration must be handled as a focused checkpoint
- do not assume PSI billing can be declared done without a dedicated verification pass

### E. Referral summary and referral ownership

Primary files:

- `apps/backend-api/src/integrations/uprm/referrals.ts`
- `apps/backend-api/src/modules/billing/referral-jobs.ts`

Verified current state:

- `UprmReferralsService.getUserReferralSummary(...)` calls UPRM route `/v1/referrals/users/:externalUserId/summary`
- on UPRM 404, PSI attempts tenant-user sync and retries
- admin referral list/settings/flag/override methods still throw `UPRM referrals seam is not implemented yet`
- local fallback logic still reads PSI tables like `referrals` and `referral_rewards_ledger`

Classification:

- user referral summary: partially backed by UPRM seam
- referral admin/control workflows: still PSI-local or not yet implemented in seam
- reward job/vesting logic: still PSI-local legacy ownership area

Phase 10 implication:

- user-facing referral read path is already crossing the seam
- admin referral management is not ready for cutover yet
- this area must be split into read migration first, admin/control migration later

---

## 3. Keep / convert / defer map for immediate execution

### Keep in PSI now

- instance lifecycle routes and queue operations in `modules/user/routes.ts`
- product/provisioning/runtime ownership
- local JWT/session bridging in `auth.ts` for now
- PSI-local `orders` table until checkout cutover is fully proven

### Convert next

- handwritten UPRM HTTP client in `apps/backend-api/src/integrations/uprm/client.ts`
  - target replacement: shared `packages/clients/uprm-client` in UPRM repo
- seam service wrappers in:
  - `integrations/uprm/billing.ts`
  - `integrations/uprm/identity.ts`
  - `integrations/uprm/referrals.ts`
    so they consume the shared client instead of bespoke request/signing code
- route consumers already using the seam:
  - `auth.ts`
  - `modules/user/routes.ts`
  - `modules/orders/routes.ts`

### Defer from the first SDK adoption checkpoint

- promoter/admin referral control workflows not yet backed by real UPRM contract
- full webhook/billing retirement until current PSI dirty billing work is classified and verified cleanly
- any settlement/promoter workflow not required by current PSI cutover

---

## 4. Exact first migration targets

These are the highest-value seam points for the first shared-SDK adoption pass:

1. `apps/backend-api/src/integrations/uprm/client.ts`
   - replace with shared SDK consumption
2. `apps/backend-api/src/modules/orders/routes.ts`
   - keep current route shape, but move it onto shared SDK-backed billing seam
3. `apps/backend-api/src/auth.ts`
   - move auth seam calls onto shared SDK-backed identity seam
4. `apps/backend-api/src/modules/user/routes.ts`
   - move profile/subscription seam reads onto shared SDK-backed identity/referral helpers
5. `apps/backend-api/src/integrations/uprm/referrals.ts`
   - keep user-summary route support; defer admin controls until a real UPRM contract exists

---

## 5. Current blockers and cautions

1. PSI repo is mixed and not push-clean

- current state is ahead 1, behind 1, with multiple modified/untracked files
- new seam work must be checkpointed carefully

2. The seam already exists, so duplicated effort is a risk

- do not create a second parallel seam architecture
- replace and consolidate the current one

3. PSI still has local fallback ownership in several flows

- this is useful for staged migration, but dangerous if left implicit
- every fallback must be documented and later retired deliberately

4. Admin referral workflows are not ready for first-pass migration

- current seam methods explicitly throw not-implemented errors for admin referral operations
- do not overpromise this area in the first SDK checkpoint

---

## 6. Immediate consequence for Phase 10 execution

The next correct implementation move after this inventory is:

- build the shared `packages/clients/uprm-client` in `/srv/uprm`
- then rebind PSI’s existing seam services to use that package
- start with auth, checkout, and user-read seam points already proven in current PSI code

This inventory means Task 2 is complete enough to start SDK work without guessing repo paths or seam entrypoints.
