# Settlix MVP roadmap

MVP = PRD P0 scope (`docs/PRD.md` §6). Each phase ends with verification, a commit/push, and a stop
for the user's approval. Status: ⬜ not started · 🟡 in progress · ✅ done (approved)

## Phase 0 — Environment setup ✅ (awaiting approval)

- Bun latest (1.4.3); SessionStart hook for cloud sessions.
- Skills: Next.js (`next-dev-loop`, `next-cache-components-optimizer`, `next-bundle-optimizer`),
  Supabase (`supabase`, `supabase-postgres-best-practices`), `shadcn`, `ai-sdk`, Vercel React
  (`vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`), and a
  project-authored `paypal-rest` skill (no official PayPal skill exists).
- MCP: `next-devtools`, `shadcn`, `paypal` (sandbox-only wrapper); Supabase via connector.
- Supabase project `settlix` created (`hdmaouuzkmwyobepooeg`, us-east-1, free tier).
- `CLAUDE.md`, `.env.example`, PRD copied to `docs/PRD.md`.

## Phase 1 — App foundation & design system ⬜

No credentials needed.

- Scaffold Next.js 16 (App Router, TS strict, Turbopack, `src/`) with Bun;
  `reactCompiler: true`, `cacheComponents: true`.
- Tailwind v4 + shadcn/ui init; PayPal-matched theme tokens (light + dark).
- shadcn dashboard shell: collapsible sidebar, header with breadcrumbs, theme toggle, account menu,
  mobile sheet navigation, persistent "Sandbox demo" indicator.
- Route skeletons with loading/empty states: `/`, `/login`, `/dashboard`, `/cases`,
  `/cases/[caseId]`, `/policies`, `/payments`, `/settings`, `/receipts/[receiptId]`.
- Tooling: lint, typecheck, unit test runner, scripts.
- **Exit:** `bun run build` passes; screenshots verified at mobile / tablet / desktop.

## Phase 2 — Database, auth & seed data ⬜

Needs: Supabase secret key (server-only); a couple of Supabase Auth dashboard settings.

- Migrations for PRD §12 tables (merchants, merchant_members, orders, cases, return_policies,
  policy_clauses, investigations, refund_attempts, audit_events) with enums, constraints, indexes.
- RLS by merchant membership + role; append-only audit events; generated TS types.
- Supabase SSR auth: login/logout, server-side session validation, protected routes, demo entry.
- Seed demo merchant, policies with clauses, and cases for every FR-19 scenario (labeled demo).
- **Exit:** sign in → see only your merchant's data; Supabase security advisors clean.

## Phase 3 — PayPal Sandbox proof ⬜

Needs: PayPal Sandbox app Client ID + Secret; a sandbox buyer (personal) account.

- Server-only PayPal adapter: OAuth token caching, create order, capture, get capture, refund
  (with `PayPal-Request-Id`), get refund, typed error mapping. Money utils with unit tests.
- `/payments`: sandbox test checkout (PayPal buttons) → server create/capture → persist order ID +
  capture ID mapping → create a linked case. Integration status panel (no secrets shown).
- **Exit:** a real sandbox capture is stored with its capture ID and a server-side refund against it
  succeeds (cross-checked with the PayPal MCP `get_refund`).

## Phase 4 — Policies, AI investigation & eligibility engine ⬜

Needs: Anthropic API key (+ model choice).

- Policies screen: list, view, create/edit version with clauses, activate.
- Merchant-scoped policy retrieval; Claude via AI SDK structured output (Zod); prompt v1 with
  prompt-injection defenses; citation validation against stored clauses; investigation persisted
  with model, prompt version, policy snapshot.
- Deterministic eligibility engine with reason codes (PRD FR-08) + unit tests.
- Eval fixtures for the PRD §10.8 scenarios.
- **Exit:** investigations on seeded cases produce valid, cited, stored recommendations.

## Phase 5 — Resolution workflow: inbox → approval → refund → receipt ⬜

- Resolution Inbox (shadcn data table): search, filter by status/category, sort by date/amount,
  status counts, attention indicators.
- Investigation workspace (facts | AI recommendation & evidence | checks & action), responsive.
- Request evidence / send to review actions.
- "Approve and issue refund": confirmation dialog, Postgres claim function (row lock + unique active
  attempt + idempotency key), PayPal refund, persisted response, state transitions, audit events.
- Resolution Receipt page with timeline and copyable summary; editable customer reply draft.
- **Exit:** case → investigate → approve → genuine sandbox refund → receipt, end to end.

## Phase 6 — Reliability & negative paths ⬜

- Duplicate clicks / concurrent approvals, amount above balance, already refunded, missing mapping,
  PayPal rejection, pending, timeout → `RECOVERY_REQUIRED` + reconcile action, AI failures,
  rate limits, cross-merchant access.
- Unit + integration tests; Playwright E2E for PRD §17.3 flows.
- **Exit:** critical negative paths fail safely and preserve truthful payment state.

## Phase 7 — Dashboard, polish & submission readiness ⬜

- Operational dashboard from persisted data (no fabricated metrics), attention list, integration health.
- Accessibility/responsive audit, empty/error/loading states.
- Deploy (Vercel) with env vars; Supabase Auth URLs; fresh-browser verification.
- README per PRD §22, setup + sandbox + demo instructions, known limitations.
- **Exit:** deployed app + public repo ready for the demo video.

## After MVP (only on request)

P1: AG Grid case queue (sponsor target), PayPal webhook reconciliation, richer policy management,
extra metrics. P2 (ignored for now): ElevenLabs voice, AG Studio, agentic intake, PDF policy upload.
