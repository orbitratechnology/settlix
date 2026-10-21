-- Policy publishing (FR-06, FR-16).
--
-- A policy version is a draft until it is published. Published versions and their
-- clauses are immutable, so an investigation's citation always resolves to the
-- exact clause text it quoted; changing a policy means creating a new draft
-- version. Only a published version can be active.
--
-- manual_review_above_minor is a structured review threshold the deterministic
-- eligibility engine enforces (requests above it always need a merchant review).

alter table public.return_policies
  add column published_at timestamptz,
  add column manual_review_above_minor bigint
    check (manual_review_above_minor is null or manual_review_above_minor > 0);

-- Every existing version was seeded as published policy text.
update public.return_policies set published_at = created_at;

-- The seeded demo policy's MR-1 clause reviews requests above $500. A no-op on a
-- fresh database, where the seed script sets it.
update public.return_policies
set manual_review_above_minor = 50000
where id = '5eed0000-0000-4000-8000-000200000002';

alter table public.return_policies
  add constraint return_policies_active_requires_published
    check (not is_active or published_at is not null);

create function private.guard_return_policy_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.published_at is not null and current_user <> 'postgres' then
      raise exception 'published policy versions cannot be deleted'
        using errcode = 'check_violation';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.published_at is not null or new.is_active then
      raise exception 'new policy versions start as inactive drafts'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.name is distinct from old.name
    or new.version is distinct from old.version
    or new.created_at is distinct from old.created_at
    -- created_by may only be cleared (ON DELETE SET NULL), never reassigned.
    or (new.created_by is distinct from old.created_by and new.created_by is not null) then
    raise exception 'policy identity fields are immutable' using errcode = 'check_violation';
  end if;

  -- Published versions can only be activated or deactivated.
  if old.published_at is not null and (
    new.published_at is distinct from old.published_at
    or new.description is distinct from old.description
    or new.content is distinct from old.content
    or new.return_window_days is distinct from old.return_window_days
    or new.manual_review_above_minor is distinct from old.manual_review_above_minor
    or new.effective_from is distinct from old.effective_from
    or new.effective_until is distinct from old.effective_until
  ) then
    raise exception 'published policy versions are immutable; create a new version'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create function private.guard_policy_clause_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_policy_id uuid := case when tg_op = 'DELETE' then old.policy_id else new.policy_id end;
begin
  if tg_op = 'UPDATE' and new.policy_id is distinct from old.policy_id then
    raise exception 'clauses cannot move between policies' using errcode = 'check_violation';
  end if;

  -- A cascaded delete of a draft no longer finds its parent, so it is allowed.
  if exists (
    select 1 from public.return_policies p
    where p.id = v_policy_id and p.published_at is not null
  ) and not (tg_op = 'DELETE' and current_user = 'postgres') then
    raise exception 'clauses of a published policy version are immutable'
      using errcode = 'check_violation';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger return_policies_guard_write
  before insert or update or delete on public.return_policies
  for each row execute function private.guard_return_policy_write();
create trigger policy_clauses_guard_write
  before insert or update or delete on public.policy_clauses
  for each row execute function private.guard_policy_clause_write();

revoke all on function
  private.guard_return_policy_write(),
  private.guard_policy_clause_write()
from public, anon, authenticated;

-- Publishes (if needed) and activates one policy version, deactivating the other
-- versions of the same policy in the same transaction. Called only by server code
-- after it has authorized the member for p_merchant_id.
create function public.activate_policy_version(p_merchant_id uuid, p_policy_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text;
  v_published_at timestamptz;
begin
  select p.name, p.published_at into v_name, v_published_at
  from public.return_policies p
  where p.id = p_policy_id and p.merchant_id = p_merchant_id
  for update;

  if not found then
    raise exception 'policy version not found' using errcode = 'no_data_found';
  end if;

  if v_published_at is null and not exists (
    select 1 from public.policy_clauses c where c.policy_id = p_policy_id
  ) then
    raise exception 'a policy version needs at least one clause'
      using errcode = 'check_violation';
  end if;

  -- Serialize concurrent activations of the same policy.
  perform 1 from public.return_policies p
  where p.merchant_id = p_merchant_id and p.name = v_name
  for update;

  update public.return_policies p
  set is_active = false
  where p.merchant_id = p_merchant_id
    and p.name = v_name
    and p.is_active
    and p.id <> p_policy_id;

  update public.return_policies p
  set is_active = true, published_at = coalesce(p.published_at, now())
  where p.id = p_policy_id;
end;
$$;

revoke all on function public.activate_policy_version(uuid, uuid) from public, anon, authenticated;
grant execute on function public.activate_policy_version(uuid, uuid) to service_role;
