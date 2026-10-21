---
name: paypal-rest
description: "Use for ANY Settlix task that touches PayPal: OAuth tokens, Orders v2 (create / get / capture), buyer approval with the JS SDK v6 / @paypal/react-paypal-js, capture IDs vs order IDs, Payments v2 refunds (full / partial / status / reconciliation), PayPal-Request-Id idempotency and retries, PayPal error bodies (name / debug_id / details[].issue), webhooks (PAYMENT.CAPTURE.*, PAYMENT.REFUND.*, CHECKOUT.ORDER.*) and signature verification, sandbox accounts and negative testing (PayPal-Mock-Response), the @paypal/paypal-server-sdk vs fetch choice, and the project's sandbox-only PayPal MCP server. Grounded only in PayPal's official docs, OpenAPI specs and npm metadata, verified 2026-10-21."
metadata:
  author: settlix
  version: "1.0.0"
  verified_on: "2026-10-21"
---

# PayPal REST (Settlix, sandbox only)

This is not a PayPal-published skill. Everything here was checked against official PayPal sources
on **2026-10-21** (see [Sources](#sources)). When something is marked **UNVERIFIED**, do not rely
on it. Check the linked page or test it in the sandbox first.

Reference files (read them when you work on that area):
- `references/orders-and-capture.md`: create/capture bodies, response shapes, statuses, capture errors
- `references/refunds.md`: refund request/response, statuses, error `issue` catalog, reconciliation
- `references/idempotency-and-errors.md`: PayPal-Request-Id rules, retry classification, error format
- `references/webhooks.md`: event types, postback verification with the raw body, dedupe, route sketch
- `references/sandbox-testing.md`: sandbox accounts, negative testing, mock codes, card testing
- `references/client-checkout.md`: JS SDK v6 / react-paypal-js for Next.js 16, package versions
- `references/fetch-adapter.md`: the recommended typed `fetch` adapter (TypeScript, one module)

## Settlix safety rules (non-negotiable)

1. **Sandbox only.** Base URL must be exactly `https://api-m.sandbox.paypal.com`. Refuse to run if
   it is anything else. The client SDK `environment` must be `"sandbox"`. In v6, the client ID does
   *not* select the environment.
2. **Server-side only.** Every REST call, the client secret and every access token stay on the
   server (`import "server-only"`). The **client ID is the only PayPal value allowed in the
   browser**, for example as `NEXT_PUBLIC_PAYPAL_CLIENT_ID`. Never prefix the secret, tokens or
   webhook ID with `NEXT_PUBLIC_`.
3. **Never trust browser amounts or IDs.** The server computes the order total from its own DB.
   The browser only sends the Settlix order ID, and later the PayPal order ID it got back. After
   capture, compare the captured `amount` and `custom_id`/`reference_id` with the DB before marking
   anything paid. (PayPal's own quickstart reads `req.body.amount`. Do not copy that.)
4. **Persist intent and idempotency key before calling refund.** Insert the refund row, including
   the Settlix refund ID, capture ID, amount in minor units, currency and a fresh UUID
   `paypal_request_id`, in state `REQUESTED`, and commit. Only then call PayPal with
   `PayPal-Request-Id: <that uuid>`.
5. **Uncertain outcome means `RECOVERY_REQUIRED`.** Timeouts, network errors, 5xx on a POST,
   202, 409 `PREVIOUS_REQUEST_IN_PROGRESS` and 429 do not prove a refund failed. In the adapter,
   that is any `PayPalError.kind` other than `rejected`. Reconcile by
   **re-sending the identical request with the same `PayPal-Request-Id`**, then
   `GET /v2/payments/refunds/{id}`, `GET /v2/payments/captures/{id}`, or
   `GET /v2/checkout/orders/{id}` (`payments.refunds[]` matched by `custom_id`). **Never send a new
   refund with a new request ID for an uncertain operation.**
6. **Only refund `status: "COMPLETED"` counts as refunded.** `PENDING` stays pending, so wait for
   the webhook or poll with GET. `FAILED` and `CANCELLED` mean no money moved.
7. **Order ID is not capture ID.** Refunds take the **capture ID** from
   `purchase_units[].payments.captures[].id`. Store both. Never pass an order ID to
   `/v2/payments/captures/...`.
8. **Log only `debug_id`**, plus your own IDs, HTTP status, `name` and `details[].issue`. Never log
   `Authorization` headers, access tokens, the client secret, full webhook headers, or buyer PII.
9. **Money is integer minor units internally.** Convert explicitly to PayPal's decimal string
   (`1999` becomes `"19.99"` for USD). Never use floats. See `references/fetch-adapter.md`.
10. **The PayPal MCP server is for developers, never for the app** (see [MCP](#paypal-mcp-server-developer-only)).

## 1. Environment and OAuth 2.0

- Sandbox REST base: `https://api-m.sandbox.paypal.com` (live is `https://api-m.paypal.com`; Settlix never uses it).
- Token request, server only:
  ```http
  POST /v1/oauth2/token
  Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)
  Content-Type: application/x-www-form-urlencoded

  grant_type=client_credentials
  ```
  The response has `access_token`, `token_type: "Bearer"`, `expires_in` (seconds, for example
  `31668`), `app_id`, `scope` and `nonce`. Send `Authorization: Bearer <access_token>` on every
  call.
- **Cache the token** in process memory until `expires_in` minus a safety margin. PayPal's
  rate-limit guide says to reuse tokens rather than mint one per request. De-duplicate concurrent
  refreshes. On a 401 from an API call, drop the cache, fetch a new token once, and retry with the
  **same** `PayPal-Request-Id`.
- Identity (OAuth) errors use a different body: `{ "error", "error_description" }`. For example,
  `401 invalid_client` means the credentials are wrong or come from the wrong environment.

## 2. Checkout flow and ID map

```
browser: click PayPal button
  -> createOrder(): POST /api/... (Settlix route; sends only the Settlix order ID)
       server: POST /v2/checkout/orders   (amount from DB)   -> returns PayPal ORDER id
  -> PayPal popup/modal: buyer logs in with a sandbox PERSONAL account, approves
  -> onApprove({ orderId }): POST /api/.../capture
       server: POST /v2/checkout/orders/{orderId}/capture -> CAPTURE id in purchase_units[0].payments.captures[0].id
```

| Value | Where it comes from | Used for |
| --- | --- | --- |
| PayPal order ID | `id` of create order response | approval, `GET/capture /v2/checkout/orders/{id}` |
| Capture ID | `purchase_units[i].payments.captures[j].id` in the capture or GET order response | `GET /v2/payments/captures/{id}`, refunds |
| Refund ID | `id` of refund response | `GET /v2/payments/refunds/{id}` |
| `reference_id` | you send it, max 256 (PayPal sets `"default"` if omitted) | Settlix order ID per purchase unit |
| `custom_id` | you send it, max 255 on orders and 127 on refund requests, not shown to the payer | Settlix order or refund ID for reconciliation |
| `invoice_id` | you send it, max 127, **shown to the payer**, **unique per merchant by default** | optional; reuse causes `DUPLICATE_INVOICE_ID` |
| Webhook event `id` | `id` of the event body | dedupe |

Trap: PayPal's refund guide says the capture ID is `capture.result.id`. For an **Orders** capture
response, top-level `id` is the **order** ID. Always read `purchase_units[].payments.captures[].id`.
A capture links back to its order through `supplementary_data.related_ids.order_id`.

## 3. Orders v2 essentials (details in `references/orders-and-capture.md`)

- `POST /v2/checkout/orders` takes `{ intent: "CAPTURE", purchase_units: [{ reference_id, custom_id, amount: { currency_code: "USD", value: "19.99" } }] }`.
  - Send `PayPal-Request-Id`, which the server stores for 6 hours by default (Orders spec), and
    `Prefer: return=representation`. The default is `return=minimal`, which returns only id, status
    and links.
  - A 201 means created. A 200 means an idempotent replay. A 202 means accepted for async
    processing: treat it as not done and poll GET.
  - Legacy `application_context` fields are DEPRECATED. Use
    `payment_source.paypal.experience_context`, which supports `shipping_preference`, `user_action`,
    `brand_name`, `return_url` and `cancel_url`.
- `GET /v2/checkout/orders/{id}`: order `status` is one of `CREATED | SAVED | APPROVED | VOIDED | COMPLETED | PAYER_ACTION_REQUIRED`.
- `POST /v2/checkout/orders/{id}/capture` with body `{}`, `PayPal-Request-Id` and
  `Prefer: return=representation`.
  - **Order `COMPLETED` does not mean paid.** PayPal says to check
    `purchase_units[].payments.captures[].status` before fulfilling.
  - Capture `status` is one of `COMPLETED | PENDING | DECLINED | PARTIALLY_REFUNDED | REFUNDED | FAILED`.
  - `status_details.reason` (for PENDING or denied) is one of `BUYER_COMPLAINT, CHARGEBACK, ECHECK,
    INTERNATIONAL_WITHDRAWAL, OTHER, PENDING_REVIEW, RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION,
    REFUNDED, TRANSACTION_APPROVED_AWAITING_FUNDING, UNILATERAL, VERIFICATION_REQUIRED,
    DECLINED_BY_RISK_FRAUD_FILTERS`.
  - Fulfil only on `COMPLETED`. `PENDING` waits for `PAYMENT.CAPTURE.COMPLETED` or a GET.
    `DECLINED` and `FAILED` mean not paid.
  - Capture errors (422 unless noted):
    - `ORDER_ALREADY_CAPTURED`: success already happened. GET the order and read the capture ID.
    - `ORDER_NOT_APPROVED`: the buyer has not approved yet.
    - `INSTRUMENT_DECLINED` or `REDIRECT_PAYER_FOR_ALTERNATE_FUNDING`: the buyer must pick another
      funding source.
    - `PAYER_ACTION_REQUIRED`, `TRANSACTION_REFUSED`, `DUPLICATE_INVOICE_ID`.
    - 409 `PREVIOUS_REQUEST_IN_PROGRESS`: retry later with the same ID.
- Capture promptly inside `onApprove`. After approval, PayPal can reverse an uncaptured payment and
  send `CHECKOUT.PAYMENT-APPROVAL.REVERSED`. The v5 docs give a default window of 3 hours, merchant
  configurable.

## 4. Refunds, Payments v2 (details in `references/refunds.md`)

- `POST /v2/payments/captures/{capture_id}/refund` with headers `PayPal-Request-Id`,
  `Prefer: return=representation` and `Content-Type: application/json`.
  - A full refund is body `{}`. That refunds *captured amount minus previous refunds*, so it is
    the **remaining** balance.
  - A partial refund is `{ "amount": { "value": "5.00", "currency_code": "USD" } }`. The amount is
    positive, in the capture currency, and at most the unrefunded remainder.
  - Optional fields are `invoice_id` (max 127), `custom_id` (max 127), and `note_to_payer` (max 255,
    shown to the buyer).
  - **Settlix:** always send an explicit `amount` and `custom_id = <settlix refund id>`, so
    replays and reconciliation are deterministic.
- The response is `id`, `status`, `status_details.reason`, `amount`, `invoice_id`, `custom_id`,
  `note_to_payer`, `seller_payable_breakdown` (`gross_amount`, `paypal_fee`, `net_amount`,
  `total_refunded_amount`, which is cumulative for the capture), `payer`, `create_time`,
  `update_time`, and `links` (`self` points to the refund, `up` to the capture). A 201 means
  created. A 200 is shown in the spec as the "idempotent response".
- Refund `status` is one of `COMPLETED | PENDING | FAILED | CANCELLED`. The only documented
  `status_details.reason` is `ECHECK`.
- `GET /v2/payments/refunds/{refund_id}` returns the same refund object.
- `GET /v2/payments/captures/{capture_id}` returns the capture's `amount` and `status`, which
  becomes `PARTIALLY_REFUNDED` or `REFUNDED` after refunds. It also returns
  `seller_receivable_breakdown` (`gross_amount`, `paypal_fee`, `net_amount`, ...) and
  `supplementary_data.related_ids.order_id`. The capture does **not** list its refunds. Use the
  order's `purchase_units[].payments.refunds[]` (per the Orders schema) or stored refund IDs.
- Common refund `issue` codes, verified in the Payments v2 `x-errors` catalog:
  `CAPTURE_FULLY_REFUNDED, REFUND_AMOUNT_EXCEEDED, PARTIAL_REFUND_NOT_ALLOWED,
  REFUND_TIME_LIMIT_EXCEEDED, MAX_NUMBER_OF_REFUNDS_EXCEEDED, REFUND_NOT_ALLOWED,
  REFUND_CAPTURE_CURRENCY_MISMATCH, REFUND_FAILED_INSUFFICIENT_FUNDS, TRANSACTION_DISPUTED,
  REFUND_NOT_PERMITTED_DUE_TO_CHARGEBACK, PENDING_CAPTURE, INSTRUMENT_DECLINED, PERMISSION_DENIED,
  TRANSACTION_REFUSED, REFUND_TRANSACTION_REFUSED, DUPLICATE_REFUND, PREVIOUS_REQUEST_IN_PROGRESS,
  INVALID_RESOURCE_ID`. The full list is in `references/refunds.md`.
  - **UNVERIFIED and not found:** `DUPLICATE_REQUEST_ID` and any `REFUND_EXCEEDED_*` code.
  - Refund window: the guide says to refund within **180 days** of capture.

## 5. Idempotency and retries (details in `references/idempotency-and-errors.md`)

- **Headers.** `PayPal-Request-Id` is honored on POST create order, capture order, authorize
  order, capture authorization, reauthorize, void, and **refund capture**. It is not documented for
  GET or for `verify-webhook-signature`.
- **Retention.** Refund keys are kept **45 days**. Orders keys (create, authorize, capture) are
  kept **6 hours** by default, and an account manager can extend that to 72 hours.
- **Replay** with the same ID returns the **latest status** of the original operation. It does not
  perform the operation again. PayPal "provides the status of a request at the current time and
  not the status of the original request". Omitting the header lets PayPal duplicate the request.
- Two **simultaneous** requests with the same ID: PayPal processes the first and may fail the
  second. The second failure is presumably 409 `PREVIOUS_REQUEST_IN_PROGRESS`. Space out retries.
- **Key format and scope.**
  - Make each key unique per operation and per call type. Do not reuse one UUID for both capture
    and refund.
  - Use UUIDs, which PayPal recommends.
  - Reuse the same key **only** with the identical method, path and body. **UNVERIFIED:** what
    PayPal does with the same key and a different body.
- **On timeout, network error or 5xx** from a POST, retry the **identical** request with the
  **same** `PayPal-Request-Id`, with backoff. Never mint a new ID while the outcome is unknown.
  PayPal itself says to repeat `/capture` with the same `PayPal-Request-Id` after a 5xx or timeout.
- **On 429**, back off exponentially and honor `Retry-After` if present. PayPal does not publish
  its rate limits.

## 6. Error format and HTTP mapping

```json
{ "name": "UNPROCESSABLE_ENTITY", "message": "...", "debug_id": "90bff07028f7f",
  "details": [{ "issue": "REFUND_AMOUNT_EXCEEDED", "description": "...", "field": "/amount", "value": "...", "location": "body" }],
  "links": [{ "href": "...", "rel": "information_link" }] }
```
- 400 `INVALID_REQUEST` (schema or validation)
- 401 `AUTHENTICATION_FAILURE` (or OAuth `invalid_client`)
- 403 `NOT_AUTHORIZED`, with `PERMISSION_DENIED` in details
- 404 `RESOURCE_NOT_FOUND`, with `INVALID_RESOURCE_ID`
- 409 `RESOURCE_CONFLICT`, with `PREVIOUS_REQUEST_IN_PROGRESS`
- 422 `UNPROCESSABLE_ENTITY` (business rule)
- 429 `RATE_LIMIT_REACHED`
- 500 `INTERNAL_SERVER_ERROR`
- 503 `SERVICE_UNAVAILABLE`

Branch on **`details[].issue`**, never on `message` or `description`, which PayPal says can change.
Do not match on `name` exactly either: one official 422 example spells it `UNPROCCESSABLE_ENTITY`.
Log `debug_id`, which PayPal support asks for.

## 7. Webhooks (details in `references/webhooks.md`)

- Subscribe the sandbox REST app's listener, which must be **HTTPS on port 443** (a tunnel for
  local dev). Record its **webhook ID** in `PAYPAL_WEBHOOK_ID`. An app can have up to 10 URLs.
- Events for Settlix:
  - Payments v2: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`,
    `PAYMENT.CAPTURE.DECLINED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.REVERSED`,
    `PAYMENT.REFUND.PENDING`, `PAYMENT.REFUND.FAILED`.
  - `PAYMENT.CAPTURE.DENIED` is listed under Payments v1 and the marketplaces section. Subscribe to
    it too, because it is harmless.
  - Orders: `CHECKOUT.ORDER.APPROVED` and `CHECKOUT.PAYMENT-APPROVAL.REVERSED`.
    `CHECKOUT.ORDER.COMPLETED` is for marketplaces and platforms only.
- **Verify every event.** Call `POST /v1/notifications/verify-webhook-signature` with
  `auth_algo`, `cert_url`, `transmission_id`, `transmission_sig` and `transmission_time` (from the
  `PAYPAL-AUTH-ALGO`, `PAYPAL-CERT-URL`, `PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-SIG` and
  `PAYPAL-TRANSMISSION-TIME` headers), plus `webhook_id` and `webhook_event`.
  - Accept only `verification_status === "SUCCESS"`.
  - Read the body with `await req.text()` and splice the **raw** event into the verify body.
    PayPal warns that re-serialised JSON can fail verification.
  - Simulator (mock) events cannot be postback-verified. Their self-verify webhook ID is the
    literal `WEBHOOK_ID`.
- **Dedupe by event `id`.** Return 2xx fast. Any non-2xx makes PayPal retry up to 25 times over 3
  days.
- **Treat events as hints.** Re-fetch `GET capture` or `GET refund` before changing state, and
  apply transitions idempotently.

## 8. Sandbox testing (details in `references/sandbox-testing.md`)

- **Accounts.** The Developer Dashboard, under Testing Tools > Sandbox Accounts, has a default
  **Business** account (merchant, `sb-...@business.example.com`) and a default **Personal**
  account (buyer, `sb-...@personal.example.com`). Use Create account for more. Log in to the
  approval popup with the personal account. Check transactions at `https://www.sandbox.paypal.com`.
- **Negative testing (beta, sandbox only).** Add the header
  `PayPal-Mock-Response: {"mock_application_codes": "<ISSUE_CODE>"}` to supported calls. These are
  Payments v2 GET authorization, capture authorization, void, GET capture, **refund capture** and
  **GET refund**, and Orders v2 create, patch, GET, authorize and **capture**. The quickstart also
  says to turn on **Negative Testing** for the sandbox business account (View/Edit Account >
  Settings).
  - Refund codes from PayPal's refund guide: `REFUND_AMOUNT_EXCEEDED`, `CAPTURE_FULLY_REFUNDED`,
    `REFUND_NOT_ALLOWED_AFTER_180_DAYS`, `PERMISSION_DENIED` (403) and `INTERNAL_SERVER_ERROR`
    (500).
  - Capture and create codes from the quickstart: `INSUFFICIENT_FUNDS`, `INSTRUMENT_DECLINED`,
    `TRANSACTION_REFUSED`, `INTERNAL_SERVER_ERROR` and `DUPLICATE_INVOICE_ID`.
  - Gate the header behind an explicit dev-only flag and never let the browser choose it.
- Mock headers cannot simulate a **timeout** or a lost response. Test those by aborting your own
  fetch (`AbortSignal.timeout`) after PayPal has received the request, then reconcile.
- In sandbox, refunds complete instantly (per PayPal's refund guide), so `PENDING` refunds are hard
  to reproduce.

## 9. Client-side buyer approval (details in `references/client-checkout.md`)

- **Current and recommended: JS SDK v6.** PayPal's v5-to-v6 guide labels v5
  (`/sdk/js?client-id=...`) deprecated.
- For React and Next.js use **`@paypal/react-paypal-js@10.6.0`** (npm `latest`, published
  2026-10-05) and import from **`@paypal/react-paypal-js/sdk-v6`**. The package root still exports
  the legacy v5 `PayPalScriptProvider`/`PayPalButtons`. Do not use them.
- It depends on `@paypal/paypal-js@^11.2.1` (latest **11.3.0**, 2026-10-20, for non-React code via
  `@paypal/paypal-js/sdk-v6`). Peers are React 16.8 through 19. Authenticate with a **client ID**;
  client tokens are only for Fastlane.
- `<PayPalProvider clientId environment="sandbox" components={["paypal-payments"]} pageType="checkout">`
  wraps `<PayPalOneTimePaymentButton createOrder={async () => ({ orderId })} onApprove={async ({ orderId }) => ...} />`.
  Both callbacks must call **your** server routes.

## 10. Server SDK vs plain fetch

- `@paypal/paypal-server-sdk@2.5.0` (2026-08-21, MIT) is PayPal's current official Node/TS server
  SDK. It covers Orders v2, Payments v2, Vault v3, Transaction Search and Subscriptions, and
  exposes `paypalRequestId`, `prefer` and `paypalMockResponse`. It has **no Webhooks controller**
  (verification still needs fetch) and pulls in `@apimatic/*` and axios adapters.
- `@paypal/checkout-server-sdk` is **deprecated on npm**, and PayPal's message points to
  `@paypal/paypal-server-sdk`. Do not use it, even though the quickstart pages still show it.
- **Settlix choice: one thin typed `fetch` module.** It has zero deps, controls timeouts, keeps
  the token cache explicit, separates "unknown outcome" errors from "rejected" errors, and covers
  webhooks. See `references/fetch-adapter.md`. Its shape is `getAccessToken`, `createOrder`,
  `getOrder`, `captureOrder`, `getCapture`, `refundCapture(requestId)`, `getRefund`,
  `verifyWebhookSignature`, plus `minorToPayPal`/`payPalToMinor`.

## PayPal MCP server (developer only)

- Configured in `.mcp.json` as `paypal` and launched by `scripts/mcp/paypal-mcp.sh`. The launcher
  refuses any base URL except sandbox, and mints one access token at launch from env or
  `.env.local`. Restart the server if its calls start returning 401 after the token expires. It
  then runs `@paypal/mcp@1.8.1 --tools=all` with `PAYPAL_ENVIRONMENT=SANDBOX`.
- Use it **only for developer inspection and verification**: `get_order`, `get_refund` and
  `list_transactions`. Use `create_refund` only when a human explicitly asks for a manual sandbox
  refund.
- It is **never used by the Settlix app at runtime**. The app talks to PayPal only through the
  fetch adapter.
- The tool list has **no `get_capture`**. Use `get_order`, which includes
  `payments.captures[]`, or the adapter.
- MCP `create_refund` calls bypass Settlix's refund table and idempotency keys. Do not use them to
  "fix" a `RECOVERY_REQUIRED` refund. Reconcile through the adapter with the stored request ID.

## UNVERIFIED / open items

- `DUPLICATE_REQUEST_ID` and `REFUND_EXCEEDED_*`: not found in any official source checked.
- Behaviour when one `PayPal-Request-Id` is reused with a different body: not documented.
- The HTTP status for each Payments `x-errors` issue is not stated. The spec examples show 422 for
  business rules.
- The `resource` payload shape of `PAYMENT.CAPTURE.REFUNDED` and `PAYMENT.REFUND.*` events is not
  documented in the pages checked. Inspect `resource_type` and re-fetch.
- `REFUND_NOT_ALLOWED_AFTER_180_DAYS` and `INSUFFICIENT_FUNDS` appear only in the guides' mock
  tables, not in the API error catalogs.
- The name of the response header carrying the debug ID is not confirmed (docs mention a
  "debug_id or correlation_id from the response header"). Use the body `debug_id`.

## Sources

Verified on 2026-10-21. developer.paypal.com pages were fetched as `.md`. docs.paypal.ai links
redirect to developer.paypal.com.
- https://developer.paypal.com/llms.txt (doc index)
- https://developer.paypal.com/api/rest/ · https://developer.paypal.com/api/rest/authentication/
- https://developer.paypal.com/api/rest/requests/ (headers, PayPal-Request-Id 45 days for refunds, PayPal-Mock-Response, BN code)
- https://developer.paypal.com/api/rest/responses/ (status codes, error bodies, 5xx/timeout advice)
- https://developer.paypal.com/api/rest/reference/idempotency/ · https://developer.paypal.com/reference/guidelines/idempotency · https://developer.paypal.com/api/rate-limiting
- https://developer.paypal.com/api/orders/v2 and https://developer.paypal.com/api/orders/v2/schema.json (v2.36)
- https://developer.paypal.com/api/orders/v2/error-messages · https://developer.paypal.com/api/errors/overview
- https://developer.paypal.com/api/payments/v2 and https://developer.paypal.com/api/payments/v2/schema.json (v2.12, incl. `x-errors`)
- https://developer.paypal.com/api/webhooks/v1 and https://developer.paypal.com/api/webhooks/v1/schema.json
- https://developer.paypal.com/api/rest/webhooks · https://developer.paypal.com/api/rest/webhooks/rest
- https://developer.paypal.com/api/rest/webhooks/event-names · https://developer.paypal.com/api/rest/webhooks/simulator
- https://developer.paypal.com/checkout/integrate · https://developer.paypal.com/checkout/refund-payment · https://developer.paypal.com/v5/checkout/uncaptured-payments
- https://developer.paypal.com/sdk/js/set-up · https://developer.paypal.com/sdk/js/reference
- https://developer.paypal.com/sdk/react/reference · https://developer.paypal.com/v5-v6
- https://developer.paypal.com/negative-testing/overview · https://developer.paypal.com/negative-testing/request-headers
- https://developer.paypal.com/sandbox-testing/overview · https://developer.paypal.com/sandbox-testing/accounts
- https://developer.paypal.com/sandbox-testing/card-testing · https://developer.paypal.com/reference/currency-codes · https://developer.paypal.com/ai-tools/mcp-server
- https://github.com/paypal/paypal-rest-api-specifications (`openapi/checkout_orders_v2.json` v2.32, `openapi/payments_payment_v2.json`)
- https://github.com/paypal/paypal-js (`packages/react-paypal-js/README.md`, `packages/paypal-js` README)
- https://github.com/paypal/PayPal-TypeScript-Server-SDK/tree/2.5.0 (`doc/controllers/orders.md`, `doc/controllers/payments.md`)
- https://registry.npmjs.org/@paypal/react-paypal-js · https://registry.npmjs.org/@paypal/paypal-js
- https://registry.npmjs.org/@paypal/paypal-server-sdk · https://registry.npmjs.org/@paypal/checkout-server-sdk
- https://registry.npmjs.org/@paypal/mcp · https://registry.npmjs.org/@paypal/agent-toolkit
