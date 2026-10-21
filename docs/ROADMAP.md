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

## Phase 1 — App foundation & design system ✅

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

## Phase 2 — Database, auth & seed data ✅

- Migration `supabase/migrations/20261021145549_core_schema.sql` (applied): all PRD §12 tables
  except P1 webhook events, enums, checks, indexes, composite `(merchant_id, id)` FKs.
- DB guards: no merchant moves, case + refund-attempt status transition rules, immutable refund
  intent, one unresolved refund attempt per case (partial unique index), append-only audit events
  and investigations, seed rows can't carry PayPal IDs. 12 guard checks pass (rolled-back SQL test).
- Access: `authenticated` is read-only via RLS (`private.current_user_merchant_ids()`), `anon` has no
  access, writes are server-only (service role after authorization). Explicit grants.
- Supabase SSR auth: `src/proxy.ts` session refresh + redirects, `getClaims()`-based viewer and
  membership check, email/password sign-in server action (safe `next` redirect), sign-out,
  `/workspace-required` for accounts without a workspace.
- Demo access: public demo account `demo@settlix.example` (role admin, demo workspace only) shown
  on the sign-in page with a "Fill in demo account" button.
- Seed (`bun run db:seed`, idempotent): "Harbor & Pine Supply Co." demo merchant; Standard Return
  Policy v1 (inactive) and v2 (active, 11 clauses with stable keys); 10 labeled demo cases covering
  eligible full refund, partial refund, missing evidence, manual review, already refunded, invalid
  mapping, failed refund, outside window, prompt injection, contradictory claims; demo refund
  attempts and audit events (no PayPal calls); an isolation merchant for access tests.
- Pages on real data: dashboard metrics (PayPal-confirmed totals exclude demo records), attention
  list, integration health; inbox table; case page with request, order/payment, refund history and
  activity timeline; policies with clauses; settings with role capabilities; account menu.
- Verified: RLS integration tests (member sees only own merchant, other merchant invisible by ID,
  no direct writes, signed-out gets nothing), security advisor clean except an Auth setting, build
  passes, browser sign-in/out + pages at 390/820/1440px, cross-merchant case URL → not found.
- Follow-ups: optional Auth hardening in the Supabase dashboard (see summary); a demo reset that
  refreshes seed dates before judging (Phase 7).

## Phase 3 — PayPal Sandbox proof ✅ (awaiting approval)

- Server-only adapter `src/lib/paypal/`: sandbox-only base URL guard, OAuth client-credentials token
  cache (dedupes concurrent refreshes, replays once on 401 with the same `PayPal-Request-Id`), create /
  get / capture order, get capture, refund (always explicit amount + `custom_id`), get refund, typed
  errors (`rejected` / `retry_later` / `unknown`, branching on `details[].issue`, logging `debug_id`
  only), minor-unit ↔ decimal-string conversion. Unit tests with mocked `fetch`.
- Migration `20261021152456_order_capture_request_id.sql`: per-order capture idempotency key
  (seed rows can't carry one).
- Checkout: server price catalog (browser sends only an item ID) → `POST /api/paypal/orders`
  (creates the PayPal order and a Settlix order row + audit event) → JS SDK v6 button
  (`@paypal/react-paypal-js/sdk-v6`, `environment="sandbox"`) → `POST /api/paypal/orders/[id]/capture`
  (stored request ID, `ORDER_ALREADY_CAPTURED` handled, unknown outcome keeps the key, capture
  amount/currency/reference checked against the DB before marking CAPTURED). Same-origin + role checks.
- `/payments`: live connection check (REST app ID, last payment event), test checkout, sandbox
  payments table (PayPal order + capture IDs, state badges), "Check status" (re-reads PayPal and
  finishes an approved but uncaptured order), "Create case" dialog for captured payments (amount
  ceiling and currency from the DB) → redirects to the new case. Dashboard integration health now
  checks the PayPal connection.
- `bun run paypal:smoke create|finish <id>`: adapter proof against the real sandbox (capture,
  partial refund, idempotent replay, remainder refund, over-refund rejected, read back). Writes nothing.
- Verified: `bun run check` (35 tests), build, browser at 390 / 820 / 1440 px.
- Real sandbox proof (new US sandbox Business + Personal accounts, REST app `APP-5MK83820S5842033S`):
  - `paypal:smoke`: order `25P66568A8273623P` approved by the buyer → capture `4EU49693BB917721E`
    COMPLETED ($1.00) → partial refund `56340726K7401640B` COMPLETED ($0.40, 201) → replay with the
    same `PayPal-Request-Id` returned the same refund (200) → remainder refund `16078868D2241543K`
    COMPLETED ($0.60) → over-refund rejected (`CAPTURE_FULLY_REFUNDED`) → capture REFUNDED.
    Cross-checked with the PayPal MCP (`get_order`, `get_refund` ×2).
  - In-app: checkout `SBX-FB92B37F` ($89.00) → PayPal order `0SH46036KR300010D` → capture
    `4S172867UT322280T` stored as CAPTURED with audit events → case **STX-1023** opened from the
    payment (requested $25.00). The capture is left unrefunded for the Phase 5 approval flow.
  - Leftover row `SBX-5C6B2FC7` (order `0AH95725BF756782H`) is from the old, locked sandbox
    account and was never paid.
- Note: environment variable changes reach only new cloud sessions.
- **Exit:** a real sandbox capture is stored with its capture ID and a server-side refund against a
  real capture succeeds (cross-checked with the PayPal MCP `get_refund`). ✅

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
