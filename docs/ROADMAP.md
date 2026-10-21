# Settlix MVP roadmap

MVP = PRD P0 scope (`docs/PRD.md` §6). Each phase ends with verification, a commit/push, and a stop
for the user's approval. Status: ⬜ not started · 🟡 in progress · ✅ done (approved)

## Phase 0 — Environment setup ✅

- Bun latest (1.4.3); SessionStart hook for cloud sessions.
- Skills: Next.js (`next-dev-loop`, `next-cache-components-optimizer`, `next-bundle-optimizer`),
  Supabase (`supabase`, `supabase-postgres-best-practices`), `shadcn`, `ai-sdk`, Vercel React
  (`vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`), and a
  project-authored `paypal-rest` skill (no official PayPal skill exists).
- MCP: `next-devtools`, `shadcn`, `paypal` (sandbox-only wrapper); Supabase via connector.
- Supabase project `settlix` created (`hdmaouuzkmwyobepooeg`, us-east-1, free tier).
- `CLAUDE.md`, `.env.example`, PRD copied to `docs/PRD.md`.
- Credentials added as cloud environment variables and verified (Supabase URL/publishable/secret,
  PayPal sandbox client ID/secret). Still to add: `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (Phase 4).
- Deferred: PayPal **Transaction Search** still returns 403 for the sandbox app (permission not yet
  in issued tokens). Not needed by Settlix; retry later for MCP `list_transactions`.

## Phase 1 — App foundation & design system ✅ (awaiting approval)

- Next.js 16.4 (App Router, TS strict, Turbopack, `src/`) scaffolded with Bun 1.4.3;
  `reactCompiler: true`, `cacheComponents: true` (+ Partial Prefetching, the 16.4 default).
- shadcn/ui (Base UI, nova style, Tailwind v4, Lucide). Theme tokens mapped to PayPal's current
  palette (bright blue `#0066F5`, deep blue `#002991`, light blue `#60CDFF`, cool neutrals) in light
  and dark; status tokens `success` / `warning` / `info`; WCAG AA contrast checked. Geist fonts.
- Shell from the shadcn `dashboard-01` block: inset sidebar (offcanvas sheet on mobile, closes on
  navigation), header with URL breadcrumbs, PayPal Sandbox badge, theme menu (next-themes), account menu.
- Routes: `/` landing, `/login` (login-03 block; inputs disabled until auth exists), `/dashboard`
  (metric tiles with explicit no-data state, attention list, integration health), `/cases` (empty
  inbox), `/cases/[caseId]` (3-column investigation workspace layout + loading skeleton), `/policies`,
  `/payments` (sandbox details), `/settings`, `/receipts/[receiptId]` (+ loading skeleton), 404.
- Tooling: ESLint (Next + React Compiler rules), Prettier + Tailwind plugin, `tsc` typecheck,
  `bun test`; `bun run check` runs all four.
- Verified: build passes (static + partial prerender for dynamic routes); `/_next/mcp` reports no
  compilation or runtime errors; browser checks at 390px, 820px, 1440px in light and dark; mobile
  sheet navigation and theme switching work; console clean.

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
