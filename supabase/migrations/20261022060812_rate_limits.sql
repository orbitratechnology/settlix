-- Rate limits for the payment endpoints (PRD §14.5).
--
-- One fixed-window counter per merchant and action. consume_rate_limit() is
-- called by server-only code before an approval, a reconciliation, or a sandbox
-- checkout reaches PayPal. The upsert takes the bucket's row lock, so concurrent
-- callers are counted one at a time, and a new window resets the counter in
-- place: the table holds at most one row per merchant and action.

create table private.rate_limit_buckets (
  merchant_id uuid not null references public.merchants (id) on delete cascade,
  action text not null check (action ~ '^[a-z][a-z_.]{0,63}$'),
  window_start timestamptz not null,
  hits integer not null check (hits > 0),
  primary key (merchant_id, action)
);

-- Reached only through consume_rate_limit(); no client role has table access.
alter table private.rate_limit_buckets enable row level security;
revoke all on table private.rate_limit_buckets from public, anon, authenticated;
grant select, insert, update on table private.rate_limit_buckets to service_role;

create function public.consume_rate_limit(
  p_merchant_id uuid,
  p_action text,
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
  if p_merchant_id is null or p_action is null
    or p_limit is null or p_limit < 1
    or p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'invalid_rate_limit' using errcode = 'invalid_parameter_value';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into private.rate_limit_buckets as b (merchant_id, action, window_start, hits)
  values (p_merchant_id, p_action, v_window, 1)
  on conflict (merchant_id, action)
  do update set
    hits = case when b.window_start = excluded.window_start then b.hits + 1 else 1 end,
    window_start = excluded.window_start
  returning b.hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

revoke all on function public.consume_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer)
  to service_role;
