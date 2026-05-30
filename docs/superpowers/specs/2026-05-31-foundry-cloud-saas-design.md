# Foundry Cloud: $1M ARR SaaS Design Spec

Created: 2026-05-31
Source: autoplan orchestration from "make me $1M SaaS"
Status: Draft — pending review

---

## Problem Statement

Non-technical founders and product people have software ideas but cannot build them. Current AI coding tools (Cursor, Copilot, Replit Agent) require coding ability. Current no-code platforms (Bubble, Webflow) are rigid and cannot produce real production software. The gap is: "describe your idea in plain English and get a real, deployed, production-ready application" — without writing a single line of code.

## Solution

Foundry Cloud wraps Foundry's proven AI agent orchestration engine (233+ tests, V1-V4 shipped, V5 in-progress) in a hosted SaaS. Customers describe their software idea, Foundry plans it, the customer approves, Foundry builds it with AI agents, and deploys it. All through a CLI first, then a web dashboard.

### Phase 1: CLI-first (2 weeks to first dollar)

Foundry is already a working CLI. Phase 1 adds billing (Stripe), a landing page, and a `foundry cloud login` command. Technical founders pay and use Foundry immediately.

### Phase 2: Web dashboard (4-6 weeks)

Add a web UI for project management, idea input, plan review, build progress, and deployment management. Opens the product to non-technical customers.

### Pricing

| Tier | Price/mo | Includes |
|------|----------|----------|
| Starter | $49 | 1 project, 10 builds/mo, basic deploy to Vercel |
| Pro | $199 | Unlimited projects, 50 builds/mo, custom domain, team (3 seats) |
| Business | $499 | Unlimited everything, white-label deploy, priority support, API access |

### $1M ARR math

50 Business ($24,950/mo) + 200 Pro ($39,800/mo) + 500 Starter ($24,500/mo) = ~$89K/mo = ~$1.07M ARR with ~750 customers.

---

## User Stories

### Onboarding and Account

1. As a technical founder, I want to sign up with my email and start a trial, so that I can evaluate Foundry Cloud before paying.
2. As a paying customer, I want to manage my subscription (upgrade, downgrade, cancel), so that I pay for what I use.
3. As a team lead, I want to invite team members to my Foundry Cloud account, so that we can collaborate on projects.

### Project Creation and Planning

4. As a founder, I want to describe my app idea in plain English, so that Foundry can plan how to build it.
5. As a founder, I want to review the generated plan (architecture, features, timeline), so that I can approve or request changes before building starts.
6. As a founder, I want to see a cost estimate (builds, hosting, time) before approving, so that I know what I am committing to.

### Build and Deploy

7. As a founder, I want Foundry to build my approved plan automatically, so that I get working software without writing code.
8. As a founder, I want to see real-time build progress (which step, any errors, estimated completion), so that I know when my app will be ready.
9. As a founder, I want my built app deployed to a live URL automatically, so that I can use and share it immediately.
10. As a founder, I want to request changes to my deployed app (new features, fixes), so that I can iterate on my product.

### Trust and Quality

11. As a founder, I want to see proof that my app was built correctly (tests passed, screenshots, logs), so that I trust the output.
12. As a founder, I want a rollback option if a build breaks my app, so that I do not lose working state.

---

## Implementation Decisions

### 1. Foundry remains the engine — no rebuild

Foundry (TypeScript/Node CLI at /Users/user/Documents/Projects/foundry) is the orchestration core. Phase 1 does not modify Foundry's internals. It wraps Foundry with a billing/auth layer and a cloud mode that sends runs to a hosted API instead of running locally.

### 2. CLI-first architecture

Phase 1 adds a `foundry cloud` subcommand:
- `foundry cloud login` — authenticate with Foundry Cloud
- `foundry cloud plan` — submit plan request to cloud API
- `foundry cloud build` — trigger cloud build
- `foundry cloud status` — check cloud run state
- `foundry cloud deploy` — deploy built project

The cloud API runs Foundry server-side in isolated containers/worktrees per customer.

### 3. Backend stack

- API: Hono (lightweight, TypeScript, runs on Node/Bun/Cloudflare)
- Database: Turso (SQLite at edge, cheap, serverless-friendly)
- Auth: Better Auth or Clerk
- Billing: Stripe
- Hosting for customer apps: Vercel (via API)
- Container orchestration for Foundry builds: Railway or Fly.io Machines

### 4. Multi-tenant isolation

Each customer gets:
- A dedicated git repository (GitHub private repo under Foundry Cloud org, or isolated filesystem)
- Isolated worktrees for builds
- Isolated deployment targets
- Rate-limited API access

### 5. Web dashboard (Phase 2)

- Next.js App Router
- Tailwind CSS + shadcn/ui
- Dashboard: project list, plan viewer, build monitor, deployment manager
- Deployed on Vercel

### 6. What Foundry already handles (delete from scope)

- `foundry plan` — AI planning with budgets, approval, artifacts
- `foundry build` — serial/parallel agent execution, worktrees, proofs
- `foundry doctor` — environment health
- `foundry status/pause/resume` — run lifecycle
- `foundry daemon` — background process (V5, shipped)

---

## Testing Decisions

### Phase 1 testing

- API integration tests: Test the cloud API endpoints with mock Foundry execution
- Stripe webhook tests: Verify subscription lifecycle (create, upgrade, cancel, expire)
- Auth flow tests: Signup, login, token refresh, session expiry
- CLI integration: `foundry cloud login` to authenticated API calls to plan/build/status
- Existing Foundry tests: 233+ must continue passing; run before every cloud deployment

### Phase 2 testing

- E2E browser tests: Signup to describe idea to approve plan to watch build to see deployed app
- Dashboard component tests: Each UI component tested in isolation
- Vercel deployment tests: Verify customer apps deploy and serve correctly

### Testing principles

- Test external behavior, not implementation details
- Prefer integration tests over unit tests for API boundaries
- Use Foundry's existing test patterns as prior art

---

## Out of Scope

### Phase 1 out of scope

- Web dashboard UI
- Non-technical customer onboarding (the CLI is for technical users)
- Multi-language app generation (English only)
- Custom deployment targets beyond Vercel
- Team/org management
- White-label
- Mobile app generation
- AI model choice (fixed to best available)

### Phase 2 out of scope

- Enterprise SSO
- On-premise deployment
- Custom AI model fine-tuning
- Marketplace for pre-built app templates

---

## Further Notes

### Competitive moat

Foundry's competitive advantage is the orchestration engine. Competitors (Bolt, Lovable, v0) generate code in one shot from a prompt. Foundry Cloud runs a multi-step agent workflow: plan, review, approve, build, test, deploy, iterate. This produces better software because it has architecture, testing, and human approval gates built in.

### Risk: AI quality

The product is only as good as the AI models doing the building. If Foundry's planning or build agents produce broken software, customers leave. Mitigations:
- Foundry's approval gate lets customers reject bad plans before building
- Proof registry captures evidence of correctness
- Build resume allows retrying failed steps
- Rollback ensures no data loss

### Risk: Cost per customer

Running AI agents costs money (API tokens, compute). Pricing must cover costs with margin.
- Estimated cost per build: $0.50 to $5.00 (depending on complexity)
- At 50 builds/mo for Pro tier, cost is $25 to $250/mo per customer
- Pro tier at $199/mo gives enough margin

### Risk: GitHub rate limits

Foundry uses GitHub for repos and worktrees. At scale, rate limits become an issue. Phase 1 is fine (fewer than 1,000 customers). Phase 2+ may need a dedicated git server or filesystem-based isolation.
