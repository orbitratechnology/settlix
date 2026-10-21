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
  PayPal sandbox client ID/secret). `ANTHROPIC_MODEL` (`claude-haiku-5-5`) and `SETTLIX_ANTHROPIC_API_KEY` added (see Phase 4).
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

## Phase 3 — PayPal Sandbox proof ✅

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

## Phase 4 — Policies, AI investigation & eligibility engine ✅ (awaiting approval)

- Migration `20261021182739_policy_publishing.sql`: policy versions are drafts until published;
  published versions and their clauses are immutable (DB guards), only published versions can be
  active, `activate_policy_version()` publishes/activates atomically (deactivates the other version of
  the same policy), structured `manual_review_above_minor` threshold. Seed inserts drafts, adds
  clauses, then publishes; clause text shared with the eval fixtures (`src/lib/demo-policies.ts`).
- Policies: list grouped by policy with version status and active-policy conflict warnings;
  version page with clause anchors (`#clause-KEY`, opened from citations), read-only notice for
  published versions, gap warnings, version switcher; draft editor (details, add/edit/delete
  clauses, duplicate-ID errors), publish and activate, activate an older version, deactivate, new
  version (copies clauses), delete draft. Server actions check `can.managePolicies`, scope by
  workspace, and write audit events.
- AI investigation (`src/lib/ai/`, `src/lib/investigations/`): AI SDK 7 + `@ai-sdk/anthropic`,
  model from `ANTHROPIC_MODEL`, base URL pinned. `generateText` + `Output.object` with a Zod schema
  (PRD §10.3 plus structured risk flags), no tools. Prompt `investigation-v1`: case data as escaped
  JSON inside `<case_data>`, treated as untrusted; deterministic money facts supplied; no capture or
  demo flags (the engine owns those). 75 s budget, 60 k-char context cap, failures mapped to
  `timeout` / `rate_limited` / `provider_error` / `invalid_output` / `refused` /
  `context_too_large` / `not_configured`.
- Citation validation: each citation must name a retrieved policy version and clause and quote it
  verbatim (whitespace/quote/case-normalized, ellipsis fragments in order, minimum length).
- Deterministic eligibility engine (`src/lib/policy/eligibility.ts`, FR-08): 17 checks with reason
  codes (case lock, capture mapping, payment state, currency, refundable balance incl. unresolved
  attempts, requested amount, policy, return window, review threshold, AI action, citations,
  evidence, contradictions, risk flags, server-computed refund amount, freshness). It can only make
  the AI's outcome stricter; demo orders can be investigated but never approved.
- `POST /api/cases/[caseId]/investigate`: same-origin + membership, claims the case (`INVESTIGATING`,
  stale runs retaken after 3 min), per-workspace limit (20 per 15 min), stores the investigation
  (model, prompt version, policy snapshot, context hash, validated recommendation, eligibility),
  moves the case to the outcome's status, audit events (`investigation.started/completed/failed`).
  Any failure restores the case and creates no refund attempt.
- Case workspace: run/re-run with progress and safe errors; recommendation (summary, reasoning,
  cited clauses with verified/invalid state and "Open clause", evidence for/missing,
  contradictions, risk flags, extracted facts with source and confidence, copyable reply draft,
  earlier runs); checks card re-evaluated against current records on every load (stale banner when
  records changed), flagged checks first, all checks in a collapsible; approval button shown
  disabled only for eligible cases (Phase 5).
- Evals: 10 §10.8 fixtures with golden answers (`src/lib/ai/evals/`), unit-tested against the engine
  and scorer; `bun run ai:eval [--runs N] [--only id]` runs the real model and writes
  `evals/results/*.json` (schema-valid rate, action, outcome, citation validity, missing evidence,
  contradictions, injection flag, amount bound, escalation).
- Verified: `bun run check` (112 tests: engine, citations, context hash, prompt escaping, mock-model
  output/failure handling, policy guards and investigation service against the real database),
  build, advisors (no new findings), browser at 390 / 1280 / 1440 px (policy draft → clause →
  duplicate-ID error → publish → new version → delete draft → deactivate; citation deep link; case
  workspace with a mock-model investigation on the isolation merchant), route rejects cross-site
  calls.
- Cloud sessions don't pass `ANTHROPIC_API_KEY` to the agent; the key lives in
  `SETTLIX_ANTHROPIC_API_KEY` and commands run as `ANTHROPIC_API_KEY="$SETTLIX_ANTHROPIC_API_KEY" …`.
- Live eval (`claude-haiku-5-5`, results in `evals/results/`):
  - Prompt v1, 10 fixtures: 9/10 correct. The miss exposed a flaw in the fixture (and seeded
    DEMO-101): "arrived today" vs "tracking shows delivery 4 days ago", then "glass carafe" vs a
    "stoneware" order. Claude rightly treated both as conflicts. Fixed the text in the fixture, the
    seed, and the existing DEMO-101/HP-10421 rows.
  - Prompt v2 (merchant notes count as merchant records; a contradiction is a direct conflict, not
    an unstated detail), 10 fixtures × 3 runs: schema-valid 30/30, correct action and outcome 29/30,
    citations verified 84/84, expected clause cited 21/21, missing evidence 3/3, contradictions
    3/3, injection flagged 3/3, approvable amount within balance 6/6, never approvable when it must
    not be 30/30. The one miss sent a partial refund to review because the order total might include
    shipping (PR-1 caps at 25% of the item price) — a cautious, defensible escalation.
- Real investigations in the app (demo merchant, prompt v2): DEMO-103 → needs evidence (via the UI,
  ~12 s), DEMO-104 → review (over $500, repeat requester), DEMO-108 → not eligible (52 days),
  DEMO-109 → review (injection flagged, $4,800 asked on a $48 order), DEMO-110 → review
  (contradictions), STX-1023 (real sandbox capture) → needs evidence (the customer mentions photos
  but none are recorded). 22/22 citations verified. DEMO-101/102/106 are left `NEW` so the demo can
  start an investigation live.
- Phase 5 note: STX-1023 needs a way to record the evidence (e.g. a merchant note) before it can
  become eligible for approval.
- **Exit:** investigations on seeded cases produce valid, cited, stored recommendations. ✅

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
