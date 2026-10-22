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

## Phase 4 — Policies, AI investigation & eligibility engine ✅

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
- Phase 5 follow-up: merchant notes can now be added from the case page (see Phase 5 for STX-1023).
- **Exit:** investigations on seeded cases produce valid, cited, stored recommendations. ✅

## Phase 5 — Resolution workflow: inbox → approval → refund → receipt ✅

- Migration `20261021194503_refund_workflow.sql`: immutable `refund_attempts.approval_snapshot`;
  `claim_refund_attempt()` (locks case + order; requires `READY_FOR_APPROVAL`, the latest
  investigation, an app capture, a refundable payment state, matching currency, no unresolved
  attempt on the order, and 0 < amount ≤ captured − completed; inserts the `REQUESTED` attempt with
  idempotency key, request hash and snapshot; case → `REFUND_PENDING`); `record_refund_outcome()`
  (attempt + case + order payment state in one transaction; terminal outcomes are final, repeats
  are no-ops). service_role only. 19 rolled-back SQL checks passed.
- Refund service (`src/lib/refunds/`): role check → load case + latest investigation → re-run the
  eligibility engine with a freshness check → amount/currency must equal what the merchant
  confirmed → claim → audit `refund.approved` → PayPal refund (`PayPal-Request-Id` = stored key,
  explicit amount, `custom_id` = attempt ID) → verified outcome → `record_refund_outcome` → audit.
  Only a `COMPLETED` refund matching amount, currency and `custom_id` counts; 202s, malformed or
  mismatched bodies and transport errors become `RECOVERY_REQUIRED`. Reconcile ("Check with
  PayPal") GETs a known refund or replays the exact stored request (hash-checked) with the same key;
  it never creates a new refund. Routes `POST /api/cases/[caseId]/approve-and-refund` and
  `/reconcile-refund` (same-origin + membership, zod bodies, `maxDuration` 60).
- Resolution Inbox: quick views with counts (all / needs attention / open), search (case, customer,
  order, issue), status and category filters, sort by date or amount (sortable headers with
  `aria-sort`), latest AI recommendation column, attention icons, filtered empty state.
- Case workspace actions: add merchant note (appended with a timestamp), request evidence (prefilled
  from the missing evidence), send to review, decline (reviewer+). Conditional status updates and
  audit events. Approval dialog: case, order, captured, refunded before, this refund, refundable
  after, cited clauses, sandbox notice; it shows PayPal's actual result and links to the receipt.
  Decided cases (pending / refunded / recovery) show a neutral state instead of blocking checks.
- Resolution Receipt (`/receipts/[caseId]`): recommended vs actual result, approver and time, refund
  attempt + PayPal refund ID + HTTP status, decision basis (model, prompt version, checks at
  approval), verified policy evidence, mapped order/capture, customer response (factual for
  completed/pending refunds, no promised dates; editable, never sent), audit timeline, copyable
  summary. Seeded records read as demo records.
- Verified: `bun run check` (135 tests), build, advisors (no new findings), Next.js `get_errors`
  clean, no horizontal overflow on inbox / case / receipt / policies / payments / dashboard at
  390 / 820 / 1440 px.
- End-to-end in the app (real PayPal Sandbox, real Claude, cross-checked with the PayPal MCP
  `get_refund`):
  - Fresh sandbox payments are minutes old and have no shipping record, so claims about how an item
    *arrived* honestly go to review: STX-1023 (cracked carafe 29 s after capture) and STX-1040
    (damage at a studio pickup; FR-1 covers items that *arrive* damaged; photo not viewed) →
    **Needs review**. STX-1039 (cancel before dispatch) first went to review too: no clause covered
    pre-dispatch cancellations.
  - Policy gap closed through the Policies UI as the merchant would: **Standard Return Policy v3**
    (v2's clauses + `CN-1` "Cancellation before dispatch": full refund, no return) published and
    activated. Investigations run against v2 now show the "records changed" banner; re-activating
    v2 makes them current again.
  - **STX-1039**: checkout `SBX-CDDB4468` → capture `7BH421492E427902V` ($42.00) → re-run → full
    refund citing CN-1, all checks passed → approved → refund **`1J3010819W148030C` COMPLETED**
    (HTTP 201) → case Refunded, payment Refunded → receipt.
  - **STX-1041** (at 390 px): checkout `SBX-C5B4900D` → capture `01543033H1725205T` ($24.00) →
    full refund citing CN-1 + RW-1 → approved → refund **`5MY33362NF3568039` COMPLETED** → dialog
    kept the result → receipt.
- **Exit:** case → investigate → approve → genuine sandbox refund → receipt, end to end. ✅

## Phase 6 — Reliability & negative paths ✅

- Migration `20261022060812_rate_limits.sql`: `consume_rate_limit()`, a per-merchant, per-action
  fixed-window counter (`private.rate_limit_buckets`, one row per bucket, updated with
  `insert … on conflict do update` so concurrent callers count one at a time). Limits per 15 min:
  20 approvals, 30 reconciliations, 20 sandbox checkouts, 30 captures (investigations keep their
  20). Over the limit: 429 with "nothing was sent to PayPal".
- Refund service hardening (PRD §15):
  - Duplicate approval / already refunded answers with the existing attempt (`in_progress` /
    `already_refunded` + attempt, refund ID, status) instead of a generic error; the dialog shows
    it with a receipt link. A request that lost the race and then looked ineligible (the winner's
    attempt used the balance) now reports the winner's refund too.
  - Any failure before the claim commits (database down, load errors) returns "nothing was sent to
    PayPal"; a failed approval audit after the claim stops before PayPal (the stored request is
    sent once by "Check with PayPal"); a failed outcome audit no longer turns a recorded refund into
    an error. Routes return JSON for unexpected errors without claiming either outcome.
  - The investigation's "started" audit moved inside the restore-on-failure block.
  - Approve and reconcile buttons ignore a second click before the disabled state renders.
  - Checkout start shows Settlix's own reason when it refuses (e.g. rate limit).
- Test-only fault switch (`src/lib/testing/`, `SETTLIX_TEST_FAULTS=1`, never in production):
  `ai_timeout`, `ai_invalid_output` (failing models, nothing stored), `paypal_lost_response`
  (PayPal processes the refund, the answer is dropped), and PayPal sandbox negative testing
  (`PayPal-Mock-Response`): `paypal_refund_declined` (REFUND_FAILED_INSUFFICIENT_FUNDS) and
  `paypal_server_error`. Verified that negative testing is on for this sandbox account (refund
  POST mock codes → 422 / 500 on an already refunded capture, so nothing could move).
- Tests:
  - Unit: fault switch guards, PayPal adapter refuses/sends `PayPal-Mock-Response` correctly.
  - Integration (real Supabase, PayPal double via `RefundGateway`, per-run merchant so runs never
    share rate limits or touch demo data): completed refund persisted with the stored
    `PayPal-Request-Id` and audit order, repeat → existing refund, two concurrent approvals → one
    PayPal call and one attempt, tampered amount / amount above balance / currency /
    investigation → refused before any claim, rejection → FAILED + `REFUND_FAILED` with the
    payment untouched, pending → stays pending → reconcile by refund ID → REFUNDED, unknown
    outcome → RECOVERY_REQUIRED → duplicate refused → reconcile replays the identical request,
    lost response → reconcile returns PayPal's original refund (HTTP 200), partial →
    PARTIALLY_REFUNDED, other merchant / support role refused, rate limiter; investigation
    timeout / invalid structure (incl. the fault models) restore the case and store nothing.
  - Playwright (`bun run test:e2e`, own "Settlix E2E Store" workspace): E2E-06 and E2E-08 run
    without external services; E2E-01/02/03/04/05/07 and the PayPal decline run live
    (`E2E_LIVE=1`) against the real sandbox (buyer approves the popup) and Claude, and read
    PayPal's own record back.
- Verified: `bun run check` (153 tests, incl. 28 integration), build, advisors (one new INFO:
  RLS on `private.rate_limit_buckets` has no policies, by design: only the service role uses it).
- Full Playwright run with `E2E_LIVE=1`: **10/10 passed in 3.4 min** (real sandbox buyer popup,
  real Claude, PayPal read-back; refunds also cross-checked with the PayPal MCP `get_refund`):
  - E2E-08: demo case page / receipt not found with no customer data, all three POST routes 404,
    cross-site POST 403, signed-out → `/login` and 401. E2E-06: `ai_timeout` and
    `ai_invalid_output` show the error, the case stays `NEW`, no investigation or attempt.
  - E2E-03: Claude asks for the photo (EV-1), "Needs evidence", no approve action, API 409.
  - E2E-01 + E2E-04: STX-1046, capture `5RJ691278T982821N` → amount $24.01 refused (409, no
    attempt) → double-clicked approval → refund `6PX479337C5659904` COMPLETED $24.00, one refund
    at PayPal → receipt shows it.
  - E2E-02: STX-1047, price adjustment (PA-1) → refund `0E7507558N481333E` COMPLETED $7.00,
    payment Partially refunded.
  - E2E-05: STX-1048, two simultaneous approvals → one `completed`, one `in_progress` /
    `already_refunded`; one refund at PayPal (`69833824JF299702X`), one attempt.
  - E2E-07: STX-1049 → PayPal decline (negative testing, 422 `REFUND_FAILED_INSUFFICIENT_FUNDS`,
    nothing refunded, `REFUND_FAILED`) → re-investigated → refund sent, response dropped →
    `RECOVERY_REQUIRED`, no approve action → "Check with PayPal" replays the same request →
    PayPal returns the original refund `2NY19533VW135582S` (HTTP 200) → Refunded, still one refund.
- E2E data lives in the "Settlix E2E Store" workspace, never the public demo. Earlier attempts
  while the suite was being written left one captured, unused sandbox payment there.
- **Exit:** critical negative paths fail safely and preserve truthful payment state.

## Phase 7 — Dashboard, polish & submission readiness ✅

- Demo data: the seed now includes policy v3 (v2's clauses + CN-1 cancellation before dispatch)
  and skips versions that already exist by ID or by name + version (the live v3 was created in the
  app). The seven investigations that predated v3 were re-run through the app as the demo user
  (real Claude): same outcomes as before (DEMO-103 evidence, DEMO-108 not eligible, DEMO-104 / 109
  / 110, STX-1023 / 1040 review), so the demo shows no "records changed" banners.
- Dashboard (FR-17, from stored records only): new "Recent refunds" card (case, amount, PayPal
  status, refund ID or "Demo record", receipt link); metric tiles are two columns on phones and the
  odd "Confirmed refunded" tile spans two, so both grids stay full.
- Error states: `(app)/error.tsx` (keeps the sidebar), `app/error.tsx`, `global-error.tsx`, with
  retry and an error reference, never claiming whether a failed action changed anything.
- Accessibility: `tests/e2e/a11y.e2e.ts` runs axe-core (WCAG 2.1 A/AA) on every screen (landing,
  sign-in, dashboard, inbox, case with investigation and refund, receipt, policies, policy version,
  payments, settings, 404) in light and dark mode. It found two real issues, both fixed: success
  and destructive badge text below 4.5:1 on their tints (light `--success` → #0C7411, light
  `--destructive` → red-700) and the landing logo link's name not matching its text. Now clean.
- Production check: `next build` + `next start` with `SETTLIX_TEST_FAULTS=1` deliberately set: the
  fault header is ignored (genuine "Claude isn't configured" instead of the injected timeout);
  sign-in and every main page render; no server errors.
- README per PRD §22 (summary, problem, features, architecture diagram, stack, prerequisites, local
  setup and env vars, Supabase migrations and Auth URL, Claude, PayPal Sandbox setup incl. negative
  testing, test payment → case → investigate → approve → receipt walkthrough, tests, Vercel
  deployment, security notes, known limitations, demo video placeholder, license). The repository
  is public with an MIT license.
- Verified: `bun run check` (153 tests), build, Playwright deterministic specs 9/9 (E2E-06, E2E-08,
  accessibility ×4), no horizontal overflow at 390 / 820 / 1440 px.
- Deployed by the user on Vercel: **https://settlix-demo.vercel.app** (from `main`), Supabase Site
  URL set. Fresh-browser checks: HTTPS + HSTS, signed-out `/dashboard` → sign-in, anonymous API 401,
  demo sign-in and data, integration health; the test-fault header is ignored in production.
- The first live run caught two deployment issues: `ANTHROPIC_API_KEY` missing (the cloud-session
  name was used), then a key Anthropic rejected (401) while the dashboard still said "Configured".
  Integration health now checks Claude for real (Anthropic model lookup, no tokens: Connected / Key
  rejected / Model not found / Not reachable), and 401/403 investigations say the key was rejected.
- Playwright against the deployment (`E2E_BASE_URL`, own E2E workspace): accessibility ×4, E2E-08 ×3,
  E2E-03, and live E2E-01 + E2E-04 (STX-1064, refund `26848256760132720`), E2E-02 (STX-1065, $7.00
  refund `2JF96408XS659423F`, cross-checked with the PayPal MCP), E2E-05 (STX-1066, one refund
  `2YH29936RD645784X`). E2E-06/07 need the test-fault switch, which is off in production by design.
- README links the live demo; the demo video link comes after recording.
- **Exit:** deployed app + public repo ready for the demo video.

## Phase 8 — Redesign for non-technical merchants ✅ (awaiting approval)

User feedback: screens were cluttered, small, and full of technical terms. Design skills installed
in `.claude/skills/` (hallmark, design-taste-frontend, frontend-design); shadcn-admin used as the
reference for the shell. Dealt directions: landing "The product performs" (taste seed 1327972034,
type Schibsted Grotesk, palette kept from the PayPal brand), app "Framed sheet" (seed 1512417758).

- Theme: Schibsted Grotesk everywhere; one step larger small text (13 / 15 / 16 px), larger
  controls (40 px buttons and inputs), roomier cards (24 px), softer radius (12 px). New tokens:
  `--stage` (PayPal deep blue), `--field`, `--field-2`, `--field-3`, `--paper`; motion keyframes
  (`rise`, `draw`, `shutter`, `settle`) that `motion-safe:` gates.
- Landing (`src/components/landing/`): the hero is a working request check (three example
  requests from the demo store, quoting the demo policy verbatim) on a PayPal-blue stage with a
  receipt's torn edge, opened by a CSS shutter; "How a refund gets settled" shows the same request
  card one step further along in four colour fields, with a route drawn by GSAP ScrollTrigger;
  "Every case ends in writing" swaps the receipt / reply / activity log (GSAP); six safeguards as
  real interface fragments; a closing CTA and a tiled footer. Reduced motion keeps content and
  drops travel. Every fragment is labelled as an example; nothing claims a real refund.
- Shell: tinted frame + white sheet, grouped sidebar ("Daily work", "Store setup"), a live count of
  requests needing attention, a ⌘K command menu (pages + colour theme), a compact sandbox badge.
- Overview: one-sentence finding ("5 requests need your review…"), a follow-up alert, the request
  stages as stations on one line (each opens the inbox filtered via `?view=`), "Waiting on
  someone" and "Recent refunds" as readable rows, money refunded per day, connections.
- Refund requests: two-line rows (customer, problem, reason, status, Claude's suggestion, amount,
  date), pill quick views, filters by stage / reason / sort.
- Request page: a four-step progress tracker, "Your decision" first (outcome, amount, approve,
  what needs attention, "N of M checks passed"), then "Claude's check" (suggestion, missing
  information, quoted rules, reply draft; full reasoning and model details folded away). Side:
  what the customer asked, order and payment with a paid / refunded / left bar, PayPal IDs behind
  "PayPal references". The four action buttons became one "More actions" menu.
- Receipt: laid out as a receipt (state, amount, rows, approval, PayPal references), with the reply
  and "Why" beside it; technical attempt data behind a disclosure. Sign-in: two columns with an
  example receipt on the brand stage.
- Plain language across statuses, checks (engine labels and summaries), refund messages, payments
  ("paid" not "captured"), and policies ("rules" not "clauses").
- Build fix: `experimental.turbopackFileSystemCacheForBuild: false`. A warm build cache shipped the
  previous theme's CSS after `globals.css` changed; Vercel restores `.next/cache`, so production
  builds now compile CSS fresh.
- Verified: `bun run check` (158 tests), clean `next build`, Playwright 14/14 including the live
  specs (E2E-01/02/04/05 sandbox refunds, missing evidence, model failure, lost response) and axe
  in light and dark (the audit now waits for entrance animations to finish), screenshots at 390 /
  820 / 1440 in both themes with no horizontal overflow. Taste inspector on the landing: one FAIL
  (`few-pictures`: it wants photographs; the page's imagery is the product's own interface) and
  warnings reviewed.
- **Exit:** user review; deploy by merging to `main` once approved.

## After MVP (only on request)

P1: AG Grid case queue (sponsor target), PayPal webhook reconciliation, richer policy management,
extra metrics. P2 (ignored for now): ElevenLabs voice, AG Studio, agentic intake, PDF policy upload.
