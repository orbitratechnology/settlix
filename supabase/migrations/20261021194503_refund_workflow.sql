-- Refund approval and execution (FR-09, FR-11, FR-12, FR-13).
--
-- claim_refund_attempt() is the only way an app refund attempt is created. It
-- locks the case and its order, re-checks every precondition in SQL (case ready
-- for approval, approval based on the latest investigation, mapped capture,
-- currency, no unresolved attempt for the order, amount within the remaining
-- balance), then records the approved intent with its idempotency key and moves
-- the case to REFUND_PENDING in the same transaction. A duplicate click finds
-- the case already REFUND_PENDING and is refused.
--
-- record_refund_outcome() applies what PayPal reported to the attempt, the case,
-- and the order's payment state atomically.

-- What the server checked when the merchant approved (eligibility result and
-- evidence hash). Part of the immutable intent.
alter table public.refund_attempts add column approval_snapshot jsonb
  check (approval_snapshot is null or jsonb_typeof(approval_snapshot) = 'object');

create or replace function private.guard_refund_attempt_write()
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
    or new.approval_snapshot is distinct from old.approval_snapshot
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

revoke all on function private.guard_refund_attempt_write() from public, anon, authenticated;

create function public.claim_refund_attempt(
  p_merchant_id uuid,
  p_case_id uuid,
  p_attempt_id uuid,
  p_investigation_id uuid,
  p_amount_minor bigint,
  p_currency text,
  p_approved_by uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_approval_snapshot jsonb
)
returns public.refund_attempts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_case public.cases;
  v_order public.orders;
  v_latest uuid;
  v_refunded bigint;
  v_attempt public.refund_attempts;
begin
  select * into v_case
  from public.cases c
  where c.id = p_case_id and c.merchant_id = p_merchant_id
  for update;
  if not found then
    raise exception 'case_not_found' using errcode = 'no_data_found';
  end if;
  if v_case.status <> 'READY_FOR_APPROVAL' then
    raise exception 'case_not_ready' using errcode = 'check_violation',
      detail = v_case.status::text;
  end if;

  select i.id into v_latest
  from public.investigations i
  where i.case_id = p_case_id and i.merchant_id = p_merchant_id
  order by i.created_at desc, i.id desc
  limit 1;
  if v_latest is distinct from p_investigation_id then
    raise exception 'stale_investigation' using errcode = 'check_violation';
  end if;

  -- Serializes refunds against the same order, also across cases.
  select * into v_order
  from public.orders o
  where o.id = v_case.order_id and o.merchant_id = p_merchant_id
  for update;
  if v_order.origin <> 'app' or v_order.paypal_capture_id is null then
    raise exception 'no_capture_mapping' using errcode = 'check_violation';
  end if;
  if v_order.payment_state not in ('CAPTURED', 'PARTIALLY_REFUNDED') then
    raise exception 'payment_not_refundable' using errcode = 'check_violation',
      detail = v_order.payment_state::text;
  end if;
  if v_order.currency_code <> p_currency or v_case.currency_code <> p_currency then
    raise exception 'currency_mismatch' using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.refund_attempts a
    where a.order_id = v_order.id
      and a.status in ('REQUESTED', 'PENDING', 'RECOVERY_REQUIRED')
  ) then
    raise exception 'refund_in_progress' using errcode = 'check_violation';
  end if;

  select coalesce(sum(a.approved_amount_minor), 0) into v_refunded
  from public.refund_attempts a
  where a.order_id = v_order.id
    and a.status = 'COMPLETED'
    and a.currency_code = v_order.currency_code;
  if p_amount_minor <= 0 or p_amount_minor > v_order.original_amount_minor - v_refunded then
    raise exception 'amount_exceeds_balance' using errcode = 'check_violation';
  end if;

  insert into public.refund_attempts (
    id, merchant_id, case_id, order_id, investigation_id, capture_id,
    approved_by, approved_at, approved_amount_minor, currency_code,
    idempotency_key, request_hash, approval_snapshot, status, origin
  ) values (
    p_attempt_id, p_merchant_id, p_case_id, v_order.id, p_investigation_id,
    v_order.paypal_capture_id, p_approved_by, now(), p_amount_minor, p_currency,
    p_idempotency_key, p_request_hash, p_approval_snapshot, 'REQUESTED', 'app'
  )
  returning * into v_attempt;

  update public.cases c set status = 'REFUND_PENDING' where c.id = p_case_id;

  return v_attempt;
end;
$$;

create function public.record_refund_outcome(
  p_merchant_id uuid,
  p_attempt_id uuid,
  p_status public.refund_attempt_status,
  p_paypal_refund_id text,
  p_response_code integer,
  p_response_summary jsonb,
  p_error_code text,
  p_debug_id text
)
returns public.refund_attempts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempt public.refund_attempts;
  v_case_status public.case_status;
  v_captured bigint;
  v_refunded bigint;
begin
  if p_status = 'REQUESTED' then
    raise exception 'invalid_outcome' using errcode = 'check_violation';
  end if;

  select * into v_attempt
  from public.refund_attempts a
  where a.id = p_attempt_id and a.merchant_id = p_merchant_id
  for update;
  if not found or v_attempt.origin <> 'app' then
    raise exception 'attempt_not_found' using errcode = 'no_data_found';
  end if;

  -- A settled attempt never changes; the same answer again is a no-op.
  if v_attempt.status in ('COMPLETED', 'FAILED') then
    if v_attempt.status = p_status then
      return v_attempt;
    end if;
    raise exception 'attempt_already_resolved' using errcode = 'check_violation',
      detail = v_attempt.status::text;
  end if;

  update public.refund_attempts a set
    status = p_status,
    paypal_refund_id = coalesce(p_paypal_refund_id, a.paypal_refund_id),
    response_code = coalesce(p_response_code, a.response_code),
    response_summary = coalesce(p_response_summary, a.response_summary),
    error_code = p_error_code,
    paypal_debug_id = coalesce(p_debug_id, a.paypal_debug_id)
  where a.id = p_attempt_id
  returning * into v_attempt;

  v_case_status := case p_status
    when 'COMPLETED' then 'REFUNDED'
    when 'FAILED' then 'REFUND_FAILED'
    when 'PENDING' then 'REFUND_PENDING'
    else 'RECOVERY_REQUIRED'
  end;
  update public.cases c
  set status = v_case_status
  where c.id = v_attempt.case_id
    and c.merchant_id = p_merchant_id
    and c.status in ('REFUND_PENDING', 'RECOVERY_REQUIRED')
    and c.status <> v_case_status;

  if p_status = 'COMPLETED' then
    select o.original_amount_minor into v_captured
    from public.orders o
    where o.id = v_attempt.order_id
    for update;

    select coalesce(sum(a.approved_amount_minor), 0) into v_refunded
    from public.refund_attempts a
    where a.order_id = v_attempt.order_id
      and a.status = 'COMPLETED'
      and a.currency_code = v_attempt.currency_code;

    update public.orders o
    set payment_state = case
      when v_refunded >= v_captured then 'REFUNDED'::public.order_payment_state
      else 'PARTIALLY_REFUNDED'::public.order_payment_state
    end
    where o.id = v_attempt.order_id;
  end if;

  return v_attempt;
end;
$$;

revoke all on function
  public.claim_refund_attempt(uuid, uuid, uuid, uuid, bigint, text, uuid, uuid, text, jsonb),
  public.record_refund_outcome(uuid, uuid, public.refund_attempt_status, text, integer, jsonb, text, text)
from public, anon, authenticated;
grant execute on function
  public.claim_refund_attempt(uuid, uuid, uuid, uuid, bigint, text, uuid, uuid, text, jsonb),
  public.record_refund_outcome(uuid, uuid, public.refund_attempt_status, text, integer, jsonb, text, text)
to service_role;
