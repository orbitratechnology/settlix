-- Customer request intake (Phase 9): the public request form, the customer's
-- status page, and the optional Gmail connection.
--
-- * orders keep the buyer's email and name, so a public request can only open a
--   case when the order number and the buyer's email match.
-- * cases record how they arrived (dashboard / form / email), whether the
--   customer was matched to the order, and the hash of the status-page token.
-- * case_messages is the append-only conversation with the customer (what they
--   sent, what the store posted or emailed).
-- * gmail_connections holds encrypted OAuth tokens; no client role can read it.
-- * inbound_emails are refund emails Settlix imported from the merchant's Gmail.
-- * consume_keyed_rate_limit() limits anonymous traffic by an opaque key
--   (a hash of the visitor's IP), next to the per-merchant consume_rate_limit().

-- ---------------------------------------------------------------------------
-- Orders: buyer contact
-- ---------------------------------------------------------------------------

alter table public.orders
  add column customer_email text
    check (customer_email is null or (
      char_length(customer_email) <= 254
      and customer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    )),
  add column customer_name text
    check (customer_name is null or char_length(customer_name) between 1 and 120);

create index orders_merchant_customer_email_idx
  on public.orders (merchant_id, lower(customer_email))
  where customer_email is not null;

-- Demo orders take the buyer from their demo case.
update public.orders o
set customer_email = c.customer_email,
    customer_name = c.customer_display_name
from (
  select distinct on (order_id) order_id, merchant_id, customer_email, customer_display_name
  from public.cases
  where origin = 'seed' and customer_email is not null
  order by order_id, created_at
) c
where o.id = c.order_id
  and o.merchant_id = c.merchant_id
  and o.origin = 'seed'
  and o.customer_email is null;

-- ---------------------------------------------------------------------------
-- Merchants: request form settings
-- ---------------------------------------------------------------------------

alter table public.merchants
  add column request_form_enabled boolean not null default true,
  add column auto_check_requests boolean not null default true;

-- ---------------------------------------------------------------------------
-- Cases: channel, customer match, status page
-- ---------------------------------------------------------------------------

create type public.case_channel as enum ('dashboard', 'form', 'email');

alter table public.cases
  add column channel public.case_channel not null default 'dashboard',
  -- Where a form link was shared (qr, email, site, receipt, …); free-form tag.
  add column channel_source text
    check (channel_source is null or channel_source ~ '^[a-z][a-z0-9_-]{0,31}$'),
  -- The customer's email matched the order's buyer email.
  add column customer_verified boolean not null default false,
  -- SHA-256 of the customer's status-page token; the token itself is never stored.
  add column status_token_hash text
    check (status_token_hash is null or status_token_hash ~ '^[a-f0-9]{64}$'),
  -- The Gmail thread (in the merchant's mailbox) that carries this conversation.
  add column gmail_thread_id text
    check (gmail_thread_id is null or gmail_thread_id ~ '^[A-Za-z0-9_-]{1,64}$');

create unique index cases_status_token_hash_key
  on public.cases (status_token_hash) where status_token_hash is not null;
create unique index cases_merchant_gmail_thread_key
  on public.cases (merchant_id, gmail_thread_id) where gmail_thread_id is not null;

create or replace function private.guard_case_write()
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
    or new.channel is distinct from old.channel
    -- created_by may only be cleared (ON DELETE SET NULL), never reassigned.
    or (new.created_by is distinct from old.created_by and new.created_by is not null)
    or new.created_at is distinct from old.created_at then
    raise exception 'case identity fields are immutable' using errcode = 'check_violation';
  end if;

  -- A thread, once linked, stays with the case.
  if old.gmail_thread_id is not null and new.gmail_thread_id is distinct from old.gmail_thread_id then
    raise exception 'gmail_thread_id cannot change once linked' using errcode = 'check_violation';
  end if;

  if not private.case_status_transition_allowed(old.status, new.status) then
    raise exception 'invalid case status transition % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Conversation with the customer (append-only)
-- ---------------------------------------------------------------------------

create type public.message_sender as enum ('customer', 'merchant', 'settlix');
create type public.message_channel as enum ('form', 'status_page', 'gmail');

create table public.case_messages (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null,
  case_id uuid not null,
  sender public.message_sender not null,
  -- form / status_page / gmail: where it was written or how it was delivered.
  -- Store messages are always shown on the status page; 'gmail' ones were
  -- also emailed from the merchant's Gmail.
  channel public.message_channel not null,
  subject text check (subject is null or char_length(subject) between 1 and 300),
  body text not null check (char_length(body) between 1 and 5000),
  -- No FK to auth.users: messages are append-only history.
  author_id uuid,
  gmail_message_id text check (gmail_message_id is null or gmail_message_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  gmail_thread_id text check (gmail_thread_id is null or gmail_thread_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  rfc_message_id text check (rfc_message_id is null or char_length(rfc_message_id) <= 512),
  created_at timestamptz not null default clock_timestamp(),
  unique (merchant_id, id),
  foreign key (merchant_id, case_id) references public.cases (merchant_id, id) on delete restrict,
  constraint case_messages_merchant_has_author check (sender <> 'merchant' or author_id is not null),
  constraint case_messages_gmail_ids check (channel = 'gmail' or (gmail_message_id is null and gmail_thread_id is null))
);
create index case_messages_merchant_case_created_idx
  on public.case_messages (merchant_id, case_id, created_at);
create unique index case_messages_merchant_gmail_message_key
  on public.case_messages (merchant_id, gmail_message_id) where gmail_message_id is not null;

create trigger case_messages_append_only before update or delete on public.case_messages
  for each row execute function private.prevent_append_only_mutation();

-- ---------------------------------------------------------------------------
-- Gmail connection (secrets: service role only)
-- ---------------------------------------------------------------------------

create type public.gmail_connection_status as enum ('active', 'needs_reconnect');

create table public.gmail_connections (
  merchant_id uuid primary key references public.merchants (id) on delete cascade,
  google_email text not null check (char_length(google_email) between 3 and 254),
  -- Google's stable account ID ("sub"), to notice a different account on reconnect.
  google_subject text not null check (char_length(google_subject) between 1 and 255),
  scopes text[] not null,
  -- AES-256-GCM ciphertexts (base64url "v1.iv.tag.data"); keys live only in the app.
  refresh_token_ciphertext text not null,
  access_token_ciphertext text,
  access_token_expires_at timestamptz,
  status public.gmail_connection_status not null default 'active',
  last_error text check (last_error is null or char_length(last_error) <= 300),
  last_synced_at timestamptz,
  -- Claim for one sync at a time (a stale claim is retaken).
  sync_started_at timestamptz,
  connected_by uuid not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger gmail_connections_set_updated_at before update on public.gmail_connections
  for each row execute function private.set_updated_at();
create trigger gmail_connections_prevent_merchant_change before update on public.gmail_connections
  for each row execute function private.prevent_merchant_change();

-- ---------------------------------------------------------------------------
-- Emails imported from Gmail
-- ---------------------------------------------------------------------------

create type public.inbound_email_status as enum ('to_sort', 'case_created', 'follow_up', 'dismissed');

create table public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants (id) on delete restrict,
  gmail_message_id text not null check (gmail_message_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  gmail_thread_id text not null check (gmail_thread_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  rfc_message_id text check (rfc_message_id is null or char_length(rfc_message_id) <= 512),
  from_email text not null check (char_length(from_email) between 3 and 254),
  from_name text check (from_name is null or char_length(from_name) <= 120),
  subject text check (subject is null or char_length(subject) <= 300),
  body_text text not null check (char_length(body_text) between 1 and 5000),
  received_at timestamptz not null,
  -- SPF / DKIM / DMARC passed for the From domain (Gmail's Authentication-Results).
  sender_authenticated boolean not null,
  suggested_order_id uuid,
  case_id uuid,
  status public.inbound_email_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, gmail_message_id),
  unique (merchant_id, id),
  foreign key (merchant_id, suggested_order_id) references public.orders (merchant_id, id) on delete restrict,
  foreign key (merchant_id, case_id) references public.cases (merchant_id, id) on delete restrict,
  constraint inbound_emails_case_when_linked
    check (status in ('to_sort', 'dismissed') or case_id is not null)
);
create index inbound_emails_merchant_status_received_idx
  on public.inbound_emails (merchant_id, status, received_at desc);
create index inbound_emails_merchant_case_idx
  on public.inbound_emails (merchant_id, case_id) where case_id is not null;
create index inbound_emails_merchant_order_idx
  on public.inbound_emails (merchant_id, suggested_order_id) where suggested_order_id is not null;

create trigger inbound_emails_set_updated_at before update on public.inbound_emails
  for each row execute function private.set_updated_at();
create trigger inbound_emails_prevent_merchant_change before update on public.inbound_emails
  for each row execute function private.prevent_merchant_change();

-- ---------------------------------------------------------------------------
-- Keyed rate limits for anonymous visitors
-- ---------------------------------------------------------------------------

create table private.keyed_rate_limits (
  key text primary key check (key ~ '^[a-z][a-z0-9_.:-]{0,127}$'),
  window_start timestamptz not null,
  hits integer not null check (hits > 0)
);

alter table private.keyed_rate_limits enable row level security;
revoke all on table private.keyed_rate_limits from public, anon, authenticated;
grant select, insert, update on table private.keyed_rate_limits to service_role;

create function public.consume_keyed_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_key is null or p_limit is null or p_limit < 1
    or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'invalid_rate_limit' using errcode = 'invalid_parameter_value';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into private.keyed_rate_limits as b (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key)
  do update set
    hits = case when b.window_start = excluded.window_start then b.hits + 1 else 1 end,
    window_start = excluded.window_start
  returning b.hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.consume_keyed_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_keyed_rate_limit(text, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- Row Level Security and grants
-- ---------------------------------------------------------------------------

alter table public.case_messages enable row level security;
alter table public.gmail_connections enable row level security;
alter table public.inbound_emails enable row level security;

create policy "Members can view case messages" on public.case_messages
  for select to authenticated
  using (merchant_id in (select private.current_user_merchant_ids()));

create policy "Members can view imported emails" on public.inbound_emails
  for select to authenticated
  using (merchant_id in (select private.current_user_merchant_ids()));

-- gmail_connections has no policy on purpose: only the service role reads it.

revoke all on table public.case_messages, public.gmail_connections, public.inbound_emails
  from anon, authenticated;
grant select on table public.case_messages, public.inbound_emails to authenticated;

grant select, insert, update, delete on table public.gmail_connections to service_role;
grant select, insert, update on table public.inbound_emails to service_role;
-- Append-only: no update/delete even for the server.
revoke all on table public.case_messages from service_role;
grant select, insert on table public.case_messages to service_role;
