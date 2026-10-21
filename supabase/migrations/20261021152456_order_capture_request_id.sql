-- PayPal-Request-Id for the current capture attempt of an order (FR-12).
-- Persisted before calling PayPal so a retry after a timeout reuses the same key.
-- Cleared only after a definitive rejection, so the buyer can try another funding source.
alter table public.orders
  add column paypal_capture_request_id uuid unique,
  add constraint orders_seed_has_no_capture_request
    check (origin = 'app' or paypal_capture_request_id is null);
