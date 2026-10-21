-- Settlix core schema (PRD §12).
--
-- Every business record belongs to a merchant workspace. Composite foreign keys
-- (merchant_id, id) keep related rows inside the same merchant, and triggers stop
-- a row from moving to another merchant.
--
-- Access model:
--   * authenticated users can only SELECT rows of merchants they belong to (RLS).
--   * all writes go through server-only code (service_role) after explicit
--     authorization and validation; the browser never writes directly.
--   * anon has no access to any table.
--   * audit events and investigations are append-only; refund-attempt intent is
--     immutable; case and refund-attempt status changes follow allowed transitions.

-- ---------------------------------------------------------------------------
-- Schemas and default privileges
-- ---------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- New objects in public get no implicit access; every grant below is explicit.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('owner', 'admin', 'reviewer', 'support');

-- 'seed' rows are labeled demo data; 'app' rows were created by Settlix flows
-- (including real PayPal Sandbox payments).
create type public.data_origin as enum ('seed', 'app');

create type public.order_payment_state as enum (
  'AWAITING_CAPTURE',
  'CAPTURE_PENDING',
  'CAPTURED',
  'CAPTURE_DECLINED',
  'PARTIALLY_REFUNDED',
  'REFUNDED'
);

create type public.case_status as enum (
  'NEW',
  'INVESTIGATING',
  'NEEDS_EVIDENCE',
  'NEEDS_REVIEW',
  'READY_FOR_APPROVAL',
  'REFUND_PENDING',
  'REFUNDED',
  'NOT_ELIGIBLE',
  'REFUND_FAILED',
  'RECOVERY_REQUIRED'
);

create type public.request_category as enum (
  'damaged_item',
  'not_as_described',
  'not_received',
  'wrong_item',
  'missing_parts',
  'changed_mind',
  'other'
);

create type public.case_priority as enum ('low', 'normal', 'high', 'urgent');

create type public.clause_type as enum (
  'return_window',
  'full_refund',
  'partial_refund',
  'exclusion',
  'evidence_requirement',
  'manual_review',
  'general'
);

create type public.refund_attempt_status as enum (
  'REQUESTED',
  'PENDING',
  'COMPLETED',
  'FAILED',
  'RECOVERY_REQUIRED'
);

create type public.actor_type as enum ('user', 'system', 'ai');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  default_currency char(3) not null default 'USD' check (default_currency ~ '^[A-Z]{3}$'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.merchant_members (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  unique (merchant_id, user_id)
);
create index merchant_members_user_id_idx on public.merchant_members (user_id);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete restrict,
  external_order_reference text not null
    check (char_length(external_order_reference) between 1 and 64),
  paypal_order_id text check (paypal_order_id ~ '^[A-Za-z0-9-]{10,64}$'),
  paypal_capture_id text check (paypal_capture_id ~ '^[A-Za-z0-9-]{10,64}$'),
  description text not null check (char_length(description) between 1 and 500),
  original_amount_minor bigint not null check (original_amount_minor > 0),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  captured_at timestamptz,
  payment_state public.order_payment_state not null,
  origin public.data_origin not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, external_order_reference),
  unique (merchant_id, id),
  -- A capture always belongs to a PayPal order; an order ID is never a capture ID.
  constraint orders_capture_requires_order
    check (paypal_capture_id is null or paypal_order_id is not null),
  constraint orders_capture_ids_distinct
    check (paypal_capture_id is null or paypal_capture_id <> paypal_order_id),
  -- Seed rows never claim to be PayPal payments.
  constraint orders_seed_has_no_paypal_ids
    check (origin = 'app' or (paypal_order_id is null and paypal_capture_id is null))
);
create unique index orders_paypal_order_id_key
  on public.orders (paypal_order_id) where paypal_order_id is not null;
create unique index orders_paypal_capture_id_key
  on public.orders (paypal_capture_id) where paypal_capture_id is not null;

create sequence public.case_number_seq as bigint start with 1001;

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete restrict,
  case_number text not null default ('STX-' || nextval('public.case_number_seq')::text)
    check (case_number ~ '^(STX|DEMO)-[0-9]+$'),
  order_id uuid not null,
  customer_display_name text not null check (char_length(customer_display_name) between 1 and 120),
  customer_email text check (customer_email is null or customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  customer_message text not null check (char_length(customer_message) between 1 and 5000),
  claimed_issue text not null check (char_length(claimed_issue) between 1 and 300),
  request_category public.request_category not null,
  requested_amount_minor bigint check (requested_amount_minor is null or requested_amount_minor > 0),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  supporting_details text check (supporting_details is null or char_length(supporting_details) <= 5000),
  status public.case_status not null default 'NEW',
  priority public.case_priority not null default 'normal',
  origin public.data_origin not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, case_number),
  unique (merchant_id, id),
  foreign key (merchant_id, order_id) references public.orders (merchant_id, id) on delete restrict
);
create index cases_merchant_order_idx on public.cases (merchant_id, order_id);
create index cases_merchant_status_created_idx on public.cases (merchant_id, status, created_at desc);
create index cases_merchant_created_idx on public.cases (merchant_id, created_at desc);
create index cases_created_by_idx on public.cases (created_by) where created_by is not null;

create table public.return_policies (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  version integer not null check (version > 0),
  content text not null default '' check (char_length(content) <= 20000),
  return_window_days integer check (return_window_days between 0 and 365),
  effective_from date not null,
  effective_until date check (effective_until is null or effective_until >= effective_from),
  is_active boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, name, version),
  unique (merchant_id, id)
);
-- At most one active version of a named policy per merchant.
create unique index return_policies_one_active_version
  on public.return_policies (merchant_id, name) where is_active;
create index return_policies_created_by_idx
  on public.return_policies (created_by) where created_by is not null;

create table public.policy_clauses (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,
  policy_id uuid not null,
  clause_key text not null check (clause_key ~ '^[A-Z]{2,4}-[0-9]{1,3}$'),
  title text not null check (char_length(title) between 1 and 160),
  content text not null check (char_length(content) between 1 and 4000),
  clause_type public.clause_type not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (policy_id, clause_key),
  foreign key (merchant_id, policy_id)
    references public.return_policies (merchant_id, id) on delete cascade
);
create index policy_clauses_merchant_policy_idx on public.policy_clauses (merchant_id, policy_id, position);

create table public.investigations (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,
  case_id uuid not null,
  model_provider text not null check (char_length(model_provider) between 1 and 64),
  model_id text not null check (char_length(model_id) between 1 and 128),
  prompt_version text not null check (char_length(prompt_version) between 1 and 64),
  policy_version_snapshot jsonb not null,
  input_context_hash text not null check (input_context_hash ~ '^[a-f0-9]{64}$'),
  recommendation_json jsonb not null,
  eligibility_result jsonb not null,
  -- No FK to auth.users: investigations are append-only history.
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (merchant_id, id),
  foreign key (merchant_id, case_id) references public.cases (merchant_id, id) on delete restrict
);
create index investigations_merchant_case_created_idx
  on public.investigations (merchant_id, case_id, created_at desc);
create index investigations_created_by_idx
  on public.investigations (created_by) where created_by is not null;

create table public.refund_attempts (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,
  case_id uuid not null,
  order_id uuid not null,
  investigation_id uuid,
  capture_id text check (capture_id ~ '^[A-Za-z0-9-]{10,64}$'),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz not null,
  approved_amount_minor bigint not null check (approved_amount_minor > 0),
  currency_code char(3) not null check (currency_code ~ '^[A-Z]{3}$'),
  idempotency_key uuid not null unique,
  paypal_refund_id text unique check (paypal_refund_id ~ '^[A-Za-z0-9-]{10,64}$'),
  status public.refund_attempt_status not null default 'REQUESTED',
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  response_code integer check (response_code between 100 and 599),
  response_summary jsonb,
  error_code text check (error_code is null or char_length(error_code) <= 128),
  paypal_debug_id text check (paypal_debug_id is null or char_length(paypal_debug_id) <= 64),
  origin public.data_origin not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (merchant_id, case_id) references public.cases (merchant_id, id) on delete restrict,
  foreign key (merchant_id, order_id) references public.orders (merchant_id, id) on delete restrict,
  foreign key (merchant_id, investigation_id)
    references public.investigations (merchant_id, id) on delete restrict,
  -- Real attempts always have an approving user and a PayPal capture ID;
  -- seeded demo attempts have neither and never carry a PayPal refund ID.
  constraint refund_attempts_app_requires_approval_and_capture
    check (origin = 'seed' or (approved_by is not null and capture_id is not null)),
  constraint refund_attempts_seed_has_no_paypal_ids
    check (origin = 'app' or (capture_id is null and paypal_refund_id is null))
);
-- One unresolved refund attempt per case at a time (FR-12).
create unique index refund_attempts_one_unresolved_per_case
  on public.refund_attempts (case_id)
  where status in ('REQUESTED', 'PENDING', 'RECOVERY_REQUIRED');
create index refund_attempts_merchant_case_created_idx
  on public.refund_attempts (merchant_id, case_id, created_at desc);
create index refund_attempts_merchant_order_idx on public.refund_attempts (merchant_id, order_id);
create index refund_attempts_merchant_investigation_idx
  on public.refund_attempts (merchant_id, investigation_id) where investigation_id is not null;
create index refund_attempts_approved_by_idx
  on public.refund_attempts (approved_by) where approved_by is not null;

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete restrict,
  case_id uuid,
  actor_type public.actor_type not null,
  -- No FK to auth.users so history survives user deletion.
  actor_id uuid,
  event_type text not null check (event_type ~ '^[a-z]+(\.[a-z_]+)+$'),
  event_summary text not null check (char_length(event_summary) between 1 and 500),
  metadata_json jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata_json) = 'object'),
  origin public.data_origin not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (merchant_id, case_id) references public.cases (merchant_id, id) on delete restrict,
  constraint audit_events_user_actor_has_id check (actor_type <> 'user' or actor_id is not null)
);
create index audit_events_merchant_case_created_idx
  on public.audit_events (merchant_id, case_id, created_at);
create index audit_events_merchant_created_idx on public.audit_events (merchant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function private.prevent_merchant_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.merchant_id is distinct from old.merchant_id then
    raise exception 'merchant_id cannot be changed on %', tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- Audit events and investigations are append-only. Only a direct database
-- administrator (migrations, SQL editor) can remove rows; API roles cannot.
create function private.prevent_append_only_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and current_user = 'postgres' then
    return old;
  end if;
  raise exception '% is append-only', tg_table_name using errcode = 'check_violation';
end;
$$;

create function private.case_status_transition_allowed(
  p_from public.case_status,
  p_to public.case_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or case p_from
    when 'NEW' then p_to in ('INVESTIGATING', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW', 'NOT_ELIGIBLE')
    when 'INVESTIGATING' then p_to in ('NEW', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW', 'READY_FOR_APPROVAL', 'NOT_ELIGIBLE')
    when 'NEEDS_EVIDENCE' then p_to in ('INVESTIGATING', 'NEEDS_REVIEW', 'NOT_ELIGIBLE')
    when 'NEEDS_REVIEW' then p_to in ('INVESTIGATING', 'NEEDS_EVIDENCE', 'READY_FOR_APPROVAL', 'NOT_ELIGIBLE')
    when 'READY_FOR_APPROVAL' then p_to in ('INVESTIGATING', 'NEEDS_EVIDENCE', 'NEEDS_REVIEW', 'NOT_ELIGIBLE', 'REFUND_PENDING')
    when 'REFUND_PENDING' then p_to in ('REFUNDED', 'REFUND_FAILED', 'RECOVERY_REQUIRED')
    when 'RECOVERY_REQUIRED' then p_to in ('REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED')
    when 'REFUND_FAILED' then p_to in ('INVESTIGATING', 'NEEDS_REVIEW', 'READY_FOR_APPROVAL', 'NOT_ELIGIBLE')
    when 'NOT_ELIGIBLE' then p_to in ('INVESTIGATING', 'NEEDS_REVIEW')
    else false
  end;
$$;

create function private.refund_status_transition_allowed(
  p_from public.refund_attempt_status,
  p_to public.refund_attempt_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or case p_from
    when 'REQUESTED' then p_to in ('PENDING', 'COMPLETED', 'FAILED', 'RECOVERY_REQUIRED')
    when 'PENDING' then p_to in ('COMPLETED', 'FAILED', 'RECOVERY_REQUIRED')
    when 'RECOVERY_REQUIRED' then p_to in ('PENDING', 'COMPLETED', 'FAILED')
    else false
  end;
$$;

create function private.guard_case_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.origin = 'app' and new.status <> 'NEW' then
      raise exception 'new cases must start in NEW' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.order_id is distinct from old.order_id
    or new.case_number is distinct from old.case_number
    or new.origin is distinct from old.origin
    -- created_by may only be cleared (ON DELETE SET NULL), never reassigned.
    or (new.created_by is distinct from old.created_by and new.created_by is not null)
    or new.created_at is distinct from old.created_at then
    raise exception 'case identity fields are immutable' using errcode = 'check_violation';
  end if;

  if not private.case_status_transition_allowed(old.status, new.status) then
    raise exception 'invalid case status transition % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function private.guard_refund_attempt_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.origin = 'app' and new.status <> 'REQUESTED' then
      raise exception 'new refund attempts must start in REQUESTED' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- The approved intent is immutable; only the outcome may change.
  if new.case_id is distinct from old.case_id
    or new.order_id is distinct from old.order_id
    or new.investigation_id is distinct from old.investigation_id
    or new.capture_id is distinct from old.capture_id
    -- approved_by may only be cleared (ON DELETE SET NULL), never reassigned.
    or (new.approved_by is distinct from old.approved_by and new.approved_by is not null)
    or new.approved_at is distinct from old.approved_at
    or new.approved_amount_minor is distinct from old.approved_amount_minor
    or new.currency_code is distinct from old.currency_code
    or new.idempotency_key is distinct from old.idempotency_key
    or new.request_hash is distinct from old.request_hash
    or new.origin is distinct from old.origin
    or new.created_at is distinct from old.created_at then
    raise exception 'refund attempt intent is immutable' using errcode = 'check_violation';
  end if;

  if old.paypal_refund_id is not null and new.paypal_refund_id is distinct from old.paypal_refund_id then
    raise exception 'paypal_refund_id cannot change once recorded' using errcode = 'check_violation';
  end if;

  if not private.refund_status_transition_allowed(old.status, new.status) then
    raise exception 'invalid refund attempt status transition % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger merchants_set_updated_at before update on public.merchants
  for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
  for each row execute function private.set_updated_at();
create trigger cases_set_updated_at before update on public.cases
  for each row execute function private.set_updated_at();
create trigger return_policies_set_updated_at before update on public.return_policies
  for each row execute function private.set_updated_at();
create trigger refund_attempts_set_updated_at before update on public.refund_attempts
  for each row execute function private.set_updated_at();

create trigger merchant_members_prevent_merchant_change before update on public.merchant_members
  for each row execute function private.prevent_merchant_change();
create trigger orders_prevent_merchant_change before update on public.orders
  for each row execute function private.prevent_merchant_change();
create trigger cases_prevent_merchant_change before update on public.cases
  for each row execute function private.prevent_merchant_change();
create trigger return_policies_prevent_merchant_change before update on public.return_policies
  for each row execute function private.prevent_merchant_change();
create trigger policy_clauses_prevent_merchant_change before update on public.policy_clauses
  for each row execute function private.prevent_merchant_change();
create trigger refund_attempts_prevent_merchant_change before update on public.refund_attempts
  for each row execute function private.prevent_merchant_change();

create trigger cases_guard_write before insert or update on public.cases
  for each row execute function private.guard_case_write();
create trigger refund_attempts_guard_write before insert or update on public.refund_attempts
  for each row execute function private.guard_refund_attempt_write();

create trigger audit_events_append_only before update or delete on public.audit_events
  for each row execute function private.prevent_append_only_mutation();
create trigger investigations_append_only before update or delete on public.investigations
  for each row execute function private.prevent_append_only_mutation();

revoke all on function
  private.set_updated_at(),
  private.prevent_merchant_change(),
  private.prevent_append_only_mutation(),
  private.guard_case_write(),
  private.guard_refund_attempt_write(),
  private.case_status_transition_allowed(public.case_status, public.case_status),
  private.refund_status_transition_allowed(public.refund_attempt_status, public.refund_attempt_status)
from public, anon, authenticated;

-- Called from trigger bodies at runtime with the writer's privileges.
grant execute on function
  private.case_status_transition_allowed(public.case_status, public.case_status),
  private.refund_status_transition_allowed(public.refund_attempt_status, public.refund_attempt_status)
to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Merchants the current user belongs to. SECURITY DEFINER so policies can read
-- memberships without recursing into merchant_members' own RLS. It only ever
-- returns rows for auth.uid(), lives in the unexposed private schema, and is
-- evaluated once per statement when wrapped in a sub-select.
create function private.current_user_merchant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.merchant_id
  from public.merchant_members m
  where m.user_id = (select auth.uid());
$$;

revoke all on function private.current_user_merchant_ids() from public, anon;
grant execute on function private.current_user_merchant_ids() to authenticated, service_role;

alter table public.merchants enable row level security;
alter table public.merchant_members enable row level security;
alter table public.orders enable row level security;
alter table public.cases enable row level security;
alter table public.return_policies enable row level security;
alter table public.policy_clauses enable row level security;
alter table public.investigations enable row level security;
alter table public.refund_attempts enable row level security;
alter table public.audit_events enable row level security;

create policy "Members can view their merchants" on public.merchants
  for select to authenticated
  using (id in (select private.current_user_merchant_ids()));

create policy "Members can view memberships of their merchants" on public.merchant_members
  for select to authenticated
  using (merchant_id in (select private.current_user_merchant_ids()));

create policy "Members can view orders" on public.orders
  for select to authenticated
  using (merchant_id in (select private.current_user_merchant_ids()));

create policy "Members can view cases" on public.cases
  for select to authenticated
  using (merchant_id in (select private.current_user_merchant_ids()));

create policy "Members can view return policies" on public.return_policies
  for select to authenticated
  using (merchant_id in (select private.current_user_merchant_ids()));

create policy "Members can view policy clauses" on public.policy_clauses
  for select to authenticated
  using (merchant_id in (select private.current_user_merchant_ids()));

create policy "Members can view investigations" on public.investigations
  for select to authenticated
  using (merchant_id in (select private.current_user_merchant_ids()));

create policy "Members can view refund attempts" on public.refund_attempts
  for select to authenticated
  using (merchant_id in (select private.current_user_merchant_ids()));

create policy "Members can view audit events" on public.audit_events
  for select to authenticated
  using (merchant_id in (select private.current_user_merchant_ids()));

-- ---------------------------------------------------------------------------
-- Grants (explicit; Data API exposure is opt-in)
-- ---------------------------------------------------------------------------

revoke all on table
  public.merchants,
  public.merchant_members,
  public.orders,
  public.cases,
  public.return_policies,
  public.policy_clauses,
  public.investigations,
  public.refund_attempts,
  public.audit_events
from anon, authenticated;

grant select on table
  public.merchants,
  public.merchant_members,
  public.orders,
  public.cases,
  public.return_policies,
  public.policy_clauses,
  public.investigations,
  public.refund_attempts,
  public.audit_events
to authenticated;

grant select, insert, update, delete on table
  public.merchants,
  public.merchant_members,
  public.orders,
  public.cases,
  public.return_policies,
  public.policy_clauses,
  public.refund_attempts
to service_role;

-- Append-only tables: no update/delete even for the server.
revoke all on table public.investigations, public.audit_events from service_role;
grant select, insert on table public.investigations, public.audit_events to service_role;

revoke all on sequence public.case_number_seq from anon, authenticated;
grant usage, select on sequence public.case_number_seq to service_role;
