# Settlix — agent guide

AI-powered refund resolution for merchants: Claude investigates a refund request against order and
policy evidence, deterministic rules validate it, a merchant explicitly approves, and the refund is
executed through the PayPal Sandbox with a traceable Resolution Receipt. Built for the PayPal AI
Hackathon 2026.

- Full spec: `docs/PRD.md` (source of truth for behavior, data model, security, acceptance criteria).
- Phase plan and status: `docs/ROADMAP.md`.

@AGENTS.md

## Commands

- `bun run dev` — dev server on :3000 (Turbopack; exposes `/_next/mcp`)
- `bun run check` — lint + format check + typecheck + unit tests (run before every commit)
- `bun run build` — production build (must pass at the end of each phase)
- `bun run format` — Prettier (with Tailwind class sorting); `src/components/ui/` is left as generated
- `bun test` — unit tests (`*.test.ts`, Bun test runner); `tests/integration/` runs against the real
  Supabase project (skipped without env) and needs the seed data. Writing integration tests create
  their own merchant per run (`tests/integration/fixtures.ts`, "Integration test run …", fake
  `TEST…` PayPal IDs) and pass a PayPal double through the refund service's `RefundGateway`.
- `bun run test:e2e [spec]` — Playwright suite for PRD §17.3 (`tests/e2e/*.e2e.ts`, pinned to
  `@playwright/test` 1.56.1 = the preinstalled Chromium 1194). It starts `next dev` with
  `SETTLIX_TEST_FAULTS=1` (a dev server already on :3000 is reused, so stop yours first or faults
  won't apply) and signs in as its own workspace ("Settlix E2E Store", `tests/e2e/workspace.ts`;
  password derived from `SUPABASE_SECRET_KEY`). Live specs (real sandbox checkout through the PayPal
  popup, real Claude, PayPal read-back) run only with `E2E_LIVE=1` and need
  `PAYPAL_SANDBOX_BUYER_EMAIL` / `PAYPAL_SANDBOX_BUYER_PASSWORD` and the Anthropic env.
- `bun run db:seed` — idempotent, insert-only demo data + public demo account (`src/lib/demo.ts`)
- `bun run paypal:smoke create` / `finish <ORDER_ID>` — real sandbox adapter proof (approve the order
  with the sandbox buyer in between).
- `bun run ai:eval [--runs N] [--only <fixture>]` — live Claude eval over the PRD §10.8 fixtures
  (`src/lib/ai/evals/`); writes `evals/results/*.json`, never the database. Needs the Anthropic env. Scripts that import `server-only` modules run with
  `bun --conditions=react-server`; tests mock `server-only` via `bunfig.toml` → `tests/setup.ts`.

## Database workflow

- Migrations live in `supabase/migrations/` and are applied with the Supabase MCP `apply_migration`
  (no local Docker). After applying, rename the local file to the version `list_migrations` reports,
  run `get_advisors` (security + performance), and regenerate `src/types/database.ts` with
  `generate_typescript_types`. Never edit applied migrations; add a new one.
- Test triggers/constraints with `execute_sql` inside `begin; … rollback;`.
- The Supabase connector can hang (60 s timeout, nothing applied) on some SQL: seen with function
  bodies where an advisory lock or another statement precedes `delete from`. Bisect in
  `begin; … rollback;` and restructure (e.g. `insert … on conflict do update` instead of pruning).
- Access model: `authenticated` can only `SELECT` its merchant's rows (RLS via
  `private.current_user_merchant_ids()`); `anon` has nothing. **All writes go through server-only code**
  using `createAdminClient()` after `requireMember()` + a role check (`can.*`), always scoping by the
  member's `workspace.id` (never a merchant ID from the request). Grants are explicit in migrations.
- DB-enforced invariants: composite `(merchant_id, id)` FKs, no merchant moves, case/refund status
  transition guards, immutable refund intent, one unresolved refund attempt per case, append-only
  `audit_events`/`investigations`, seed rows never carry PayPal IDs, published policy versions and
  their clauses are immutable (new versions start as drafts; only published versions can be
  active; `activate_policy_version()` swaps the active version atomically).
- Refund DB functions (service_role only): `claim_refund_attempt()` locks the case and order,
  re-checks status, latest investigation, capture mapping, payment state, currency, and balance, then
  inserts the `REQUESTED` attempt (with request hash + approval snapshot) and moves the case to
  `REFUND_PENDING`; `record_refund_outcome()` updates attempt, case, and order payment state in one
  transaction (terminal outcomes can't change). `consume_rate_limit()` is a per-merchant, per-action
  fixed-window counter (`private.rate_limit_buckets`) used by approve, reconcile, and checkout.

## Code layout

- `src/app/(app)/` — authenticated dashboard routes inside the shadcn sidebar shell
  (`layout.tsx` = `SidebarProvider` + `AppSidebar` + `SiteHeader`); `src/app/(auth)/login`; `src/app/page.tsx` landing.
- `src/components/ui/` — shadcn components (base: Base UI, style: nova). Add more with the CLI; don't hand-edit
  unless fixing a real bug. Navigation buttons are `<Link className={buttonVariants()}>` so they stay links.
- `src/components/` — app components (shell, page header, brand); feature folders (`cases/`, `receipts/`, …).
- `src/lib/navigation.ts` — sidebar items and breadcrumbs (a receipt's trail runs through its case).
- `src/lib/supabase/` — `server.ts` (user-scoped, cookies), `admin.ts` (secret key, server-only),
  `proxy.ts` (session refresh + optimistic redirects, used by `src/proxy.ts`).
- `src/lib/security/auth.ts` — `getViewer()` / `requireMember()` (getClaims + membership via RLS);
  role capabilities `can.*` live in `roles.ts` (pure). `src/lib/data/` — merchant-scoped reads used by pages.
- `src/lib/domain/labels.ts` — status/category labels and badge tones; `src/lib/money/` — integer
  minor-unit helpers (tested); `src/types/database.ts` — generated types.
- `src/lib/ai/` — Claude via AI SDK: `client.ts` (model from env, pinned base URL), `schemas.ts`
  (recommendation Zod schema), `prompts.ts` (`PROMPT_VERSION`; bump it on any prompt change),
  `investigate.ts` (structured call + failure mapping), `evals/` (§10.8 fixtures + scorer).
- `src/lib/policy/` — `eligibility.ts` (deterministic FR-08 engine; only ever stricter than the AI),
  `citations.ts` (verbatim quote validation), `retrieval.ts` (active published policies),
  `warnings.ts`. `src/lib/investigations/` — `context.ts` (evidence + stable hash), `load.ts`,
  `service.ts` (claim → Claude → validate → persist → audit; restores the case on failure),
  `records.ts` (parse stored rows). The case page re-runs the engine on current records.
- `src/lib/refunds/` — `service.ts` (`approveAndRefund`: role → re-run eligibility → rate limit →
  claim RPC → audit → PayPal → `record_refund_outcome`; a duplicate or already-refunded case answers
  with the existing attempt; any failure before the claim commits returns "nothing was sent to
  PayPal"; `reconcileRefund` GETs a known refund or replays the stored request with the same
  `PayPal-Request-Id`; PayPal calls go through an injectable `RefundGateway`), `outcome.ts` (PayPal
  response → outcome; anything unverified is `RECOVERY_REQUIRED`). Routes:
  `POST /api/cases/[caseId]/approve-and-refund` and `/reconcile-refund`.
- `src/lib/security/rate-limit.ts` — per-merchant limits for endpoints that reach PayPal.
- `src/lib/testing/` — test-only fault switch for the E2E suite: with `SETTLIX_TEST_FAULTS=1` outside
  production, the `x-settlix-test-fault` header picks a named scenario (`ai_timeout`,
  `ai_invalid_output`, `paypal_lost_response`, and PayPal sandbox negative testing via
  `PayPal-Mock-Response`). Ignored otherwise; the PayPal adapter refuses mock codes when it's off.
- `src/lib/cases/` — `inbox.ts` (search/filter/sort/counts), `actions.ts` (which status moves note,
  request evidence, send to review, and decline allow); server actions in `cases/[caseId]/actions.ts`.
- `src/lib/receipts/receipt.ts` (receipt state, factual reply, copyable summary) +
  `src/lib/data/receipts.ts`; `/receipts/[receiptId]` uses the case ID.
- Client hooks that read the URL (`usePathname`) sit inside `<Suspense>` so dynamic routes still prerender a shell.
- Request-time data (session, merchant data) is read inside `<Suspense>` boundaries; `getViewer()`
  calls `connection()` so auth is never prerendered or runtime-prefetched.

## How we work

- **Phase by phase.** Only work on the phase the user has approved. At the end of each phase: verify,
  commit, push, update `docs/ROADMAP.md`, summarize, and **stop for approval** before the next phase.
- **MVP first** = PRD P0 scope. P1 items only after the user asks. Ignore P2/optional features
  (ElevenLabs voice, AG Studio, agentic intake) unless the user asks.
- Never fake PayPal results, AI output, or credentials. If a credential is missing, stop that part
  and ask the user to add it as an environment variable in the cloud environment settings (never
  paste secrets into chat or commit them).
- Branch: develop and push on the designated session branch only.

## Stack (keep to these)

- **Bun** (latest) for everything: `bun install`, `bun run <script>`, `bunx <bin>`. No npm/pnpm/yarn lockfiles.
- **Next.js 16 App Router**, TypeScript strict, Turbopack, `src/` layout.
  - `cacheComponents: true` (Cache Components / PPR): use `"use cache"`, `cacheLife`, `cacheTag`,
    `<Suspense>` around request-time data. Auth/session and money state are never cached across users.
  - `reactCompiler: true`: don't hand-write `useMemo`/`useCallback`/`memo` for perf.
  - Server Components by default; `"use client"` only at interactive leaves.
  - Read the version-matched docs in `node_modules/next/dist/docs/` (see `AGENTS.md`) before using an
    API you're unsure about — this Next.js is newer than training data.
- **shadcn/ui** components out of the box (Tailwind CSS v4, Lucide icons). Add with
  `bunx shadcn@latest add <component|block>`. Prefer official blocks (sidebar, dashboard, login) over
  custom layouts. Don't hand-roll primitives that shadcn provides; style through theme tokens in
  `globals.css`, not ad-hoc colors.
- **Theme:** shadcn token theme matched to PayPal brand (deep/bright/medium blues on a black-and-white
  base), light + dark. Status colors are restrained and never the only signal (always a text label).
- **Responsive:** every screen must work on mobile, tablet, and desktop (shadcn dashboard style).
- **Supabase**: Postgres + Auth via `@supabase/ssr` (cookie sessions, server-side `getClaims()`/user
  validation), RLS on every merchant-owned table, migrations in `supabase/migrations/`.
  Project ref: `hdmaouuzkmwyobepooeg` (us-east-1).
- **AI**: Vercel AI SDK (`ai`) + `@ai-sdk/anthropic`, structured output validated with **Zod**.
  Model comes from `ANTHROPIC_MODEL` (server config), never hardcoded across the app.
- **PayPal**: REST API (Orders v2, Payments v2 captures/refunds) via one server-only adapter in
  `src/lib/paypal/`. Sandbox only. Buyer approval uses JS SDK v6 (`@paypal/react-paypal-js/sdk-v6`);
  the browser sends only a catalog item ID (`src/lib/payments/catalog.ts`) and the PayPal order ID.
  Checkout/capture logic lives in `src/lib/payments/checkout.ts`; JSON routes in `src/app/api/paypal/`
  use `requireApiMember()` (same-origin + membership) from `src/lib/security/api.ts`.

## Non-negotiable safety rules (from PRD §8, §11.4, §14)

- Secrets (`PAYPAL_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `SUPABASE_SECRET_KEY`) are server-only; only
  `NEXT_PUBLIC_*` reaches the browser. Use `import "server-only"` in privileged modules.
- AI is advisory. The model gets read-only, merchant-scoped context; it never gets refund/approval
  tools. Customer/policy text is untrusted data, not instructions.
- Money is integer minor units; convert to PayPal decimal strings explicitly (tested).
- Server recomputes eligibility and amount at approval time; never trust browser amounts/flags.
- Refunds: persist intent + idempotency key before calling PayPal, send `PayPal-Request-Id`, claim
  atomically in Postgres (row lock + unique active attempt). Unknown outcome → `RECOVERY_REQUIRED`,
  reconcile with the same key; never a blind new refund. Only a verified `COMPLETED` refund is "refunded".
- Case state and refund-attempt state are separate; invalid transitions are rejected server-side.
- Audit events are append-only. Logs never contain tokens, auth headers, or secrets.
- Seeded data is labeled as demo data and never claims a real refund happened.
- `SETTLIX_TEST_FAULTS` is for local/E2E runs only: never set it in a deployed environment.

## Tooling available to agents

- Skills (`.claude/skills/`): `paypal-rest` (project-authored from official PayPal docs), `supabase`,
  `supabase-postgres-best-practices`, `shadcn`, `ai-sdk`, `next-dev-loop`,
  `next-cache-components-optimizer`, `next-bundle-optimizer`, `vercel-react-best-practices`,
  `vercel-composition-patterns`, `web-design-guidelines`. Also the built-in `claude-api` skill.
- MCP (`.mcp.json`): `next-devtools` (running dev server: routes, errors, compile checks),
  `shadcn` (registry search/add), `paypal` (official `@paypal/mcp`, sandbox only, launched by
  `scripts/mcp/paypal-mcp.sh` which mints a token from `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`;
  for developer inspection/verification only — the app never uses it at runtime).
  Supabase MCP is provided by the connected Supabase connector.
- `agent-browser` CLI (used by `next-dev-loop`) for screenshots at mobile/tablet/desktop widths.
- Cloud sessions run `.claude/hooks/session-start.sh` (Bun version, `bun install`, agent-browser).

## Environment variables

See `.env.example`. Locally they live in `.env.local` (gitignored). In cloud sessions, add secrets as
environment variables in the cloud environment settings; a new session picks them up.
Cloud sessions don't pass `ANTHROPIC_API_KEY` through to the agent (the name appears reserved for
Claude Code itself), so store the key as `SETTLIX_ANTHROPIC_API_KEY` there and prefix commands
that need it: `ANTHROPIC_API_KEY="$SETTLIX_ANTHROPIC_API_KEY" bun run dev` (or `ai:eval`). The app
itself only reads `ANTHROPIC_API_KEY` (set it normally on Vercel).
