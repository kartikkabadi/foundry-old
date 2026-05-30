# Foundry Cloud Phase 1 — Vertical Slice Issues

Generated: 2026-05-31
Source: autoplan from design spec and implementation plan
Parent: [docs/superpowers/specs/2026-05-31-foundry-cloud-saas-design.md](../specs/2026-05-31-foundry-cloud-saas-design.md)

---

## Slice 1: Workspace and API Scaffold

**Type:** AFK
**Blocked by:** None — can start immediately

### What to build

Create the `foundry-cloud/` workspace directory adjacent to the existing Foundry repo. Set up a Hono API with health endpoint, Turso database client, and the initial schema (users, projects, subscriptions, builds). This slice delivers a working API that returns 200 on `/health` and has a database that can accept queries.

### Acceptance criteria

- [ ] `foundry-cloud/packages/api/` exists with `package.json`, `tsconfig.json`
- [ ] `npm install` in the API package succeeds
- [ ] `GET /health` returns `{ "status": "ok" }` when server is running
- [ ] Turso database is provisioned and schema migrations apply without error
- [ ] Users, projects, subscriptions, builds tables exist in Turso

### User stories covered

None directly — infrastructure slice.

---

## Slice 2: Auth and User Sync

**Type:** AFK
**Blocked by:** Slice 1

### What to build

Integrate Clerk authentication. Add auth middleware that validates Bearer tokens on protected routes. Add a `/api/auth/sync` endpoint that upserts the user in Turso after Clerk signup and creates a default subscription row. After this slice, the API has authenticated endpoints and users persist in the database.

### Acceptance criteria

- [ ] Clerk app is created with API keys configured
- [ ] `requireAuth` middleware rejects requests without valid Bearer token (401)
- [ ] `requireAuth` middleware passes valid tokens and sets `userId` in context
- [ ] `POST /api/auth/sync` creates user row in Turso on first call
- [ ] `POST /api/auth/sync` updates user row on subsequent calls (idempotent)
- [ ] Default subscription row is created on first sync

### User stories covered

1. As a technical founder, I want to sign up with my email and start a trial.

---

## Slice 3: Billing and Subscriptions

**Type:** AFK
**Blocked by:** Slice 2

### What to build

Integrate Stripe for subscription billing. Add a checkout session endpoint that creates a Stripe Checkout for the selected tier. Add a customer portal endpoint for subscription management. Add a Stripe webhook handler that updates the subscriptions table on checkout completion, subscription updates, and cancellations.

### Acceptance criteria

- [ ] `POST /api/billing/checkout` with `{ tier: 'pro' }` returns a Stripe Checkout URL
- [ ] Completing checkout in Stripe test mode fires webhook
- [ ] Webhook handler updates `subscriptions` row: sets `stripe_customer_id`, `stripe_subscription_id`, `tier`, `status = 'active'`
- [ ] `POST /api/billing/portal` returns a Stripe Customer Portal URL
- [ ] Cancelling subscription via portal fires webhook and sets `status = 'canceled'`
- [ ] Tier upgrade/downgrade via portal updates `tier` field

### User stories covered

2. As a paying customer, I want to manage my subscription (upgrade, downgrade, cancel).

---

## Slice 4: Project Management API

**Type:** AFK
**Blocked by:** Slice 2

### What to build

Add CRUD endpoints for projects. Users can create projects with a name and description, list their projects, view a specific project, and delete projects. Each project is scoped to the authenticated user. This slice delivers the project data model that plans and builds attach to.

### Acceptance criteria

- [ ] `POST /api/projects` with `{ name, description }` creates a project and returns it with id
- [ ] `GET /api/projects` returns only the authenticated user's projects
- [ ] `GET /api/projects/:id` returns project details including status
- [ ] `DELETE /api/projects/:id` deletes the project and returns 204
- [ ] Attempting to access another user's project returns 404 (not 403, to avoid leaking existence)

### User stories covered

4. As a founder, I want to describe my app idea in plain English (project creation is the container for this).

---

## Slice 5: Plan Submission and Retrieval

**Type:** AFK
**Blocked by:** Slice 4

### What to build

Add plan endpoints. `POST /api/projects/:id/plan` accepts an idea description, triggers Foundry's planning engine server-side, and returns a plan ID. `GET /api/projects/:id/plan` returns the plan status (planning, ready, failed) and the plan artifacts when ready. This slice wires the cloud API to Foundry's existing `foundry plan` command.

### Acceptance criteria

- [ ] `POST /api/projects/:id/plan` with `{ description: "A task management app..." }` triggers Foundry plan
- [ ] Plan runs in an isolated container/worktree for the project
- [ ] `GET /api/projects/:id/plan` returns `{ status: 'planning' }` while running
- [ ] `GET /api/projects/:id/plan` returns `{ status: 'ready', artifacts: {...} }` when complete
- [ ] Plan artifacts include architecture, feature list, and cost estimate
- [ ] Failed plans return `{ status: 'failed', error: '...' }`

### User stories covered

4. As a founder, I want to describe my app idea in plain English, so that Foundry can plan how to build it.
5. As a founder, I want to review the generated plan, so that I can approve or request changes.
6. As a founder, I want to see a cost estimate before approving.

---

## Slice 6: Build Trigger and Monitoring

**Type:** AFK
**Blocked by:** Slice 5

### What to build

Add build endpoints. `POST /api/projects/:id/build` triggers Foundry's build engine for an approved plan. `GET /api/builds/:id` returns build status, progress, and proofs. This slice wires the cloud API to Foundry's existing `foundry build` command with worktree isolation and proof capture.

### Acceptance criteria

- [ ] `POST /api/projects/:id/build` triggers Foundry build in an isolated container
- [ ] Build respects the project's plan and dependency graph
- [ ] `GET /api/builds/:id` returns `{ status: 'queued' | 'running' | 'complete' | 'failed' }`
- [ ] Running builds return current step and estimated completion
- [ ] Complete builds return proof artifacts (tests passed, screenshots, logs)
- [ ] Failed builds return error details
- [ ] Builds are rate-limited per subscription tier

### User stories covered

7. As a founder, I want Foundry to build my approved plan automatically.
8. As a founder, I want to see real-time build progress.
11. As a founder, I want to see proof that my app was built correctly.

---

## Slice 7: Deploy to Vercel

**Type:** AFK
**Blocked by:** Slice 6

### What to build

After a successful build, automatically deploy the built project to Vercel. Store the deploy URL on the project. Add a redeploy endpoint for subsequent builds. Add a rollback endpoint that restores the previous deployment.

### Acceptance criteria

- [ ] Successful build triggers Vercel deploy automatically
- [ ] Project's `deploy_url` is set to the Vercel deployment URL
- [ ] `GET /api/projects/:id` returns the `deploy_url`
- [ ] `POST /api/projects/:id/deploy` triggers a manual redeploy
- [ ] `POST /api/projects/:id/rollback` reverts to the previous deployment
- [ ] Deploy failures return clear error messages

### User stories covered

9. As a founder, I want my built app deployed to a live URL automatically.
12. As a founder, I want a rollback option if a build breaks my app.

---

## Slice 8: `foundry cloud` CLI Commands

**Type:** HITL (requires a human to test the full CLI flow interactively)
**Blocked by:** Slices 4, 5, 6

### What to build

Add `foundry cloud` subcommands to the existing Foundry CLI. Commands: `login`, `project create/list/status`, `plan`, `build`, `deploy`. Each command talks to the cloud API using the stored auth token. This slice makes Foundry Cloud usable from the terminal for technical founders.

### Acceptance criteria

- [ ] `foundry cloud login` opens browser to Clerk, stores token locally
- [ ] `foundry cloud project create "name" "description"` creates a project via API
- [ ] `foundry cloud project list` shows the user's projects
- [ ] `foundry cloud plan <project-id>` submits plan, polls until ready, displays plan
- [ ] `foundry cloud build <project-id>` triggers build, streams progress
- [ ] `foundry cloud deploy <project-id>` deploys the built project
- [ ] All commands show clear error messages on failure

### User stories covered

All user stories — this is the primary customer interface for Phase 1.

---

## Slice 9: Landing Page and Checkout

**Type:** HITL (design review needed)
**Blocked by:** Slice 3

### What to build

Build a simple landing page with value proposition, feature list, pricing table, and Stripe checkout integration. Include Clerk signup/signin. Deploy to a public URL. This is the marketing surface where customers discover and start paying for Foundry Cloud.

### Acceptance criteria

- [ ] Landing page loads at a public URL
- [ ] Pricing table shows Starter ($49), Pro ($199), Business ($499) with feature lists
- [ ] Clicking a pricing tier starts Stripe Checkout
- [ ] Clerk signup/signin works on the page
- [ ] After signup + checkout, user lands on a "Get Started" page with CLI instructions
- [ ] Page is responsive (works on mobile and desktop)

### User stories covered

1. As a technical founder, I want to sign up with my email and start a trial.

---

## Slice 10: E2E Smoke Test and Production Deploy

**Type:** HITL (requires production environment setup)
**Blocked by:** All preceding slices

### What to build

Deploy the cloud API to production (Railway or Fly.io). Deploy the landing page to Vercel. Run the full end-to-end flow: signup on landing page, Stripe checkout, `foundry cloud login`, create project, plan, approve, build, deploy. Verify the deployed customer app works. Set up monitoring, error tracking, and backups.

### Acceptance criteria

- [ ] Cloud API is deployed and responds to `GET /health`
- [ ] Landing page is deployed and publicly accessible
- [ ] Full E2E flow succeeds: signup -> pay -> login -> project -> plan -> build -> deploy
- [ ] Deployed customer app is accessible at its Vercel URL
- [ ] Stripe is in live mode (or test mode with real checkout flow working)
- [ ] Monitoring and error tracking are configured
- [ ] Database backups are configured

### User stories covered

All user stories — this is the launch gate.
