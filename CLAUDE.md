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
  Supabase project (skipped without env) and needs the seed data
- `bun run db:seed` — idempotent, insert-only demo data + public demo account (`src/lib/demo.ts`)

## Database workflow

- Migrations live in `supabase/migrations/` and are applied with the Supabase MCP `apply_migration`
  (no local Docker). After applying, rename the local file to the version `list_migrations` reports,
  run `get_advisors` (security + performance), and regenerate `src/types/database.ts` with
  `generate_typescript_types`. Never edit applied migrations; add a new one.
- Test triggers/constraints with `execute_sql` inside `begin; … rollback;`.
- Access model: `authenticated` can only `SELECT` its merchant's rows (RLS via
  `private.current_user_merchant_ids()`); `anon` has nothing. **All writes go through server-only code**
  using `createAdminClient()` after `requireMember()` + a role check (`can.*`), always scoping by the
  member's `workspace.id` (never a merchant ID from the request). Grants are explicit in migrations.
- DB-enforced invariants: composite `(merchant_id, id)` FKs, no merchant moves, case/refund status
  transition guards, immutable refund intent, one unresolved refund attempt per case, append-only
  `audit_events`/`investigations`, seed rows never carry PayPal IDs.

## Code layout

- `src/app/(app)/` — authenticated dashboard routes inside the shadcn sidebar shell
  (`layout.tsx` = `SidebarProvider` + `AppSidebar` + `SiteHeader`); `src/app/(auth)/login`; `src/app/page.tsx` landing.
- `src/components/ui/` — shadcn components (base: Base UI, style: nova). Add more with the CLI; don't hand-edit
  unless fixing a real bug. Navigation buttons are `<Link className={buttonVariants()}>` so they stay links.
- `src/components/` — app components (shell, page header, brand); feature folders (`cases/`, `receipts/`, …).
- `src/lib/navigation.ts` — sidebar items and breadcrumb labels.
- `src/lib/supabase/` — `server.ts` (user-scoped, cookies), `admin.ts` (secret key, server-only),
  `proxy.ts` (session refresh + optimistic redirects, used by `src/proxy.ts`).
- `src/lib/security/auth.ts` — `getViewer()` / `requireMember()` (getClaims + membership via RLS),
  role capabilities `can.*`. `src/lib/data/` — merchant-scoped reads used by pages.
- `src/lib/domain/labels.ts` — status/category labels and badge tones; `src/lib/money/` — integer
  minor-unit helpers (tested); `src/types/database.ts` — generated types.
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
  `src/lib/paypal/`. Sandbox only.

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
