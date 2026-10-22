-- The customer's status-page token is kept as issued (64 hex characters, the
-- shape the column already checks) instead of a hash, so members can put the
-- customer's link into a reply. Members can already read the request itself;
-- the token only opens its status page. Nothing used the hash yet.
alter table public.cases rename column status_token_hash to status_token;
alter table public.cases rename constraint cases_status_token_hash_check to cases_status_token_check;
alter index public.cases_status_token_hash_key rename to cases_status_token_key;
comment on column public.cases.status_token is
  'The customer''s status-page token (64 hex characters). It opens only this request''s status page.';
