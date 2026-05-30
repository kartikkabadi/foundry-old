# Foundry Cloud Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Foundry Cloud CLI-first: billing, auth, cloud API, and `foundry cloud` commands so technical founders can pay and use Foundry immediately.

**Architecture:** Add a Hono API server with Turso DB, Stripe billing, and Clerk auth. Add `foundry cloud` subcommands to the existing Foundry CLI. The cloud API wraps Foundry's existing plan/build/status commands with multi-tenant isolation.

**Tech Stack:** TypeScript, Hono, Turso, Stripe, Clerk (or Better Auth), Vercel (deploy), Railway/Fly (build containers), Foundry CLI (existing)

---

## File Structure (new files only)

```
foundry-cloud/
  packages/
    api/
      src/
        index.ts              — Hono app entry, route mounting
        routes/
          auth.ts             — session validation middleware
          projects.ts         — CRUD for customer projects
          plans.ts            — submit and retrieve plans
          builds.ts           — trigger and monitor builds
          webhooks/
            stripe.ts         — Stripe webhook handler
        lib/
          db.ts               — Turso client
          stripe.ts           — Stripe client + helpers
          auth.ts             — Auth middleware
          tenant.ts           — Customer isolation helpers
          foundry-runner.ts   — Wraps `foundry plan/build` in container
        db/
          schema.ts           — Turso schema definitions
          migrations/         — SQL migration files
      package.json
      tsconfig.json
      wrangler.toml           — If deploying to Cloudflare, else fly.toml
    web/                       — Phase 2 dashboard (skeleton only)
      package.json
      (empty Next.js scaffold)
  docs/
    superpowers/
      specs/2026-05-31-foundry-cloud-saas-design.md   — Design spec (written)
      plans/2026-05-31-foundry-cloud-phase1.md         — This file
```

---

## Task 1: Cloud API scaffold and database

**Files:**
- Create: `foundry-cloud/packages/api/package.json`
- Create: `foundry-cloud/packages/api/tsconfig.json`
- Create: `foundry-cloud/packages/api/src/index.ts`
- Create: `foundry-cloud/packages/api/src/lib/db.ts`
- Create: `foundry-cloud/packages/api/src/db/schema.ts`
- Create: `foundry-cloud/package.json` (workspace root)
- Create: `foundry-cloud/tsconfig.base.json`

- [ ] **Step 1: Initialize workspace and API package**

```bash
mkdir -p foundry-cloud/packages/api/src/{routes,lib,db}
cd foundry-cloud
npm init -y
```

- [ ] **Step 2: Install Hono and dependencies**

```bash
cd foundry-cloud/packages/api
npm install hono @hono/node-server
npm install -D typescript @types/node tsx
```

- [ ] **Step 3: Write Hono app entry with health check**

```typescript
// packages/api/src/index.ts
import { Hono } from 'hono'

const app = new Hono()

app.get('/health', (c) => c.json({ status: 'ok' }))

export default app
```

- [ ] **Step 4: Set up Turso database client and schema**

```typescript
// packages/api/src/lib/db.ts
import { createClient } from '@libsql/client'

export const db = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})
```

- [ ] **Step 5: Define initial schema (users, projects, subscriptions)**

```sql
-- packages/api/src/db/schema.ts
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  clerk_id TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  plan_json TEXT,
  repo_url TEXT,
  deploy_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  tier TEXT NOT NULL DEFAULT 'starter',
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS builds (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'queued',
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  proof_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 6: Run migration and verify health endpoint**

```bash
curl http://localhost:3000/health
# Expected: { "status": "ok" }
```

- [ ] **Step 7: Commit**

```bash
git add foundry-cloud/
git commit -m "feat: cloud API scaffold with Hono, Turso schema, health endpoint"
```

---

## Task 2: Authentication with Clerk

**Files:**
- Create: `foundry-cloud/packages/api/src/lib/auth.ts`
- Create: `foundry-cloud/packages/api/src/routes/auth.ts`
- Modify: `foundry-cloud/packages/api/src/index.ts`

- [ ] **Step 1: Install Clerk SDK**

```bash
cd foundry-cloud/packages/api
npm install @clerk/backend
```

- [ ] **Step 2: Write auth middleware**

```typescript
// packages/api/src/lib/auth.ts
import { Clerk } from '@clerk/backend'
import { createMiddleware } from 'hono/factory'

const clerk = Clerk({ secretKey: process.env.CLERK_SECRET_KEY! })

export const requireAuth = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  const token = authHeader.slice(7)
  try {
    const session = await clerk.sessions.getSession(token)
    c.set('userId', session.userId)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
})
```

- [ ] **Step 3: Add user sync endpoint (called after Clerk signup)**

```typescript
// packages/api/src/routes/auth.ts
import { Hono } from 'hono'
import { requireAuth } from '../lib/auth'
import { db } from '../lib/db'

const auth = new Hono()

auth.post('/sync', requireAuth, async (c) => {
  const userId = c.get('userId')
  // Upsert user on every sync
  await db.execute({
    sql: `INSERT INTO users (id, clerk_id, email) VALUES (?, ?, ?)
          ON CONFLICT(clerk_id) DO UPDATE SET email = excluded.email`,
    args: [userId, userId, c.req.header('X-User-Email') || '']
  })
  // Ensure a default subscription row
  await db.execute({
    sql: `INSERT OR IGNORE INTO subscriptions (id, user_id, tier, status)
          VALUES (?, ?, 'starter', 'inactive')`,
    args: [crypto.randomUUID(), userId]
  })
  return c.json({ synced: true })
})

export { auth }
```

- [ ] **Step 4: Mount auth routes and protect endpoints**

- [ ] **Step 5: Test: sign up via Clerk, call /api/auth/sync, verify user in Turso**

- [ ] **Step 6: Commit**

```bash
git add foundry-cloud/packages/api/src/lib/auth.ts foundry-cloud/packages/api/src/routes/auth.ts
git commit -m "feat: Clerk auth middleware and user sync endpoint"
```

---

## Task 3: Stripe billing integration

**Files:**
- Create: `foundry-cloud/packages/api/src/lib/stripe.ts`
- Create: `foundry-cloud/packages/api/src/routes/webhooks/stripe.ts`
- Modify: `foundry-cloud/packages/api/src/index.ts`

- [ ] **Step 1: Install Stripe SDK**

```bash
cd foundry-cloud/packages/api
npm install stripe
```

- [ ] **Step 2: Write Stripe client and checkout session endpoint**

```typescript
// packages/api/src/lib/stripe.ts
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export const PRICES = {
  starter: process.env.STRIPE_PRICE_STARTER!,
  pro: process.env.STRIPE_PRICE_PRO!,
  business: process.env.STRIPE_PRICE_BUSINESS!,
}
```

- [ ] **Step 3: Create checkout session endpoint**

```typescript
// POST /api/billing/checkout
// Body: { tier: 'pro' }
// Returns: { url: 'https://checkout.stripe.com/...' }
```

- [ ] **Step 4: Write Stripe webhook handler**

Handle: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Update `subscriptions` table on each event.

- [ ] **Step 5: Add customer portal endpoint for subscription management**

- [ ] **Step 6: Test: create checkout session, complete payment via Stripe test mode, verify webhook updates subscription row**

- [ ] **Step 7: Commit**

---

## Task 4: Project and build API endpoints

**Files:**
- Create: `foundry-cloud/packages/api/src/routes/projects.ts`
- Create: `foundry-cloud/packages/api/src/routes/plans.ts`
- Create: `foundry-cloud/packages/api/src/routes/builds.ts`
- Create: `foundry-cloud/packages/api/src/lib/tenant.ts`
- Create: `foundry-cloud/packages/api/src/lib/foundry-runner.ts`

- [ ] **Step 1: Write project CRUD endpoints**

```
POST   /api/projects          — create project
GET    /api/projects          — list user's projects
GET    /api/projects/:id      — get project details
DELETE /api/projects/:id      — delete project
```

- [ ] **Step 2: Write plan submission endpoint**

```
POST /api/projects/:id/plan   — submit idea description, trigger foundry plan
GET  /api/projects/:id/plan   — get plan status and artifacts
```

- [ ] **Step 3: Write build trigger and status endpoints**

```
POST /api/projects/:id/build  — trigger foundry build
GET  /api/projects/:id/builds — list builds
GET  /api/builds/:id          — get build status, progress, proofs
```

- [ ] **Step 4: Write tenant isolation helper**

```typescript
// packages/api/src/lib/tenant.ts
// Creates isolated git repo + worktree for a project
// Uses GitHub API or local filesystem depending on config
```

- [ ] **Step 5: Write Foundry runner**

```typescript
// packages/api/src/lib/foundry-runner.ts
// Wraps `foundry plan` and `foundry build` execution
// Runs in isolated container or process
// Captures output, artifacts, and proofs
```

- [ ] **Step 6: Test full flow: create project -> submit plan -> trigger build -> poll status**

- [ ] **Step 7: Commit**

---

## Task 5: `foundry cloud` CLI commands

**Files:**
- Create: `packages/cli/src/commands/cloud.ts` (or add to existing CLI)
- Modify: `packages/cli/src/cli.ts` (mount cloud subcommands)

- [ ] **Step 1: Add cloud login command**

```bash
foundry cloud login
# Opens browser to Clerk signup/login
# Stores API token in ~/.foundry/cloud-auth.json
```

- [ ] **Step 2: Add cloud project commands**

```bash
foundry cloud project create "My SaaS App" "A description..."
foundry cloud project list
foundry cloud project status <id>
```

- [ ] **Step 3: Add cloud plan command**

```bash
foundry cloud plan <project-id>
# Sends plan request to cloud API
# Polls until plan is ready
# Displays plan for review
```

- [ ] **Step 4: Add cloud build command**

```bash
foundry cloud build <project-id>
# Triggers build on cloud API
# Streams progress
# Shows deploy URL on completion
```

- [ ] **Step 5: Test end-to-end: `foundry cloud login` -> create project -> plan -> build -> get deploy URL**

- [ ] **Step 6: Commit**

---

## Task 6: Landing page and Stripe checkout

**Files:**
- Create: `foundry-cloud/packages/web/` (or standalone HTML page)

- [ ] **Step 1: Build simple landing page with pricing table**

- [ ] **Step 2: Wire Stripe checkout links to pricing buttons**

- [ ] **Step 3: Add Clerk signup/signin components**

- [ ] **Step 4: Deploy to Vercel at foundrycloud.com (or subdomain)**

- [ ] **Step 5: Test: visit landing page, click pricing tier, complete Stripe checkout, land in dashboard**

- [ ] **Step 6: Commit**

---

## Task 7: End-to-end smoke test and launch

- [ ] **Step 1: Run Foundry's existing test suite (233+ tests) — must pass**

```bash
cd /Users/user/Documents/Projects/foundry
npm test
```

- [ ] **Step 2: Run cloud API tests**

- [ ] **Step 3: Full E2E: signup on landing page -> Stripe checkout -> `foundry cloud login` -> create project -> plan -> approve -> build -> deployed app at URL**

- [ ] **Step 4: Deploy API to Railway/Fly**

- [ ] **Step 5: Smoke test production: real signup, real payment (test mode), real plan, real build, real deploy**

- [ ] **Step 6: Launch checklist: DNS, SSL, monitoring, error tracking, backup**

- [ ] **Step 7: Commit launch config**

---
