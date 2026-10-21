# Idempotency, retries and error handling

Sources:
- https://developer.paypal.com/api/rest/reference/idempotency/ and
  https://developer.paypal.com/reference/guidelines/idempotency
- https://developer.paypal.com/api/rest/requests/
- https://developer.paypal.com/api/rest/responses/
- https://developer.paypal.com/api/rate-limiting
- The Orders v2 and Payments v2 OpenAPI schemas
- github.com/paypal/paypal-rest-api-specifications
- @paypal/paypal-server-sdk 2.5.0 controller docs

## `PayPal-Request-Id`: what PayPal documents

- It enforces idempotency on REST **POST** calls. "Not all APIs support this header", so check each
  operation's reference. In Orders v2 and Payments v2 it is declared on:
  - `POST /v2/checkout/orders`
  - `POST /v2/checkout/orders/{id}/authorize`
  - `POST /v2/checkout/orders/{id}/capture`
  - `POST /v2/payments/authorizations/{id}/capture`
  - `POST /v2/payments/authorizations/{id}/reauthorize`
  - `POST /v2/payments/authorizations/{id}/void`
  - `POST /v2/payments/captures/{id}/refund`

  It is not declared on the GETs, on `PATCH` order, on `confirm-payment-source`, or on
  `/v1/notifications/verify-webhook-signature`.
- Retention:

  | operation | how long the server stores the key | source |
  | --- | --- | --- |
  | Refund captured payment | **45 days** | /api/rest/requests ("for up to 45 days"); server SDK `refundCapturedPayment` docs ("The server stores keys for 45 days") |
  | Orders create / authorize / capture | **6 hours** (up to 72 h via account manager) | Orders spec v2.32 on GitHub; server SDK `createOrder`/`captureOrder` docs |
  | Payments authorization capture / reauthorize / void | not stated (server SDK says 45 days for these too; UNVERIFIED elsewhere) | Payments schema only says "for idempotency purposes" |

- On replay, "when you include a previously specified PayPal-Request-Id header in a request,
  PayPal returns the latest status of the previous request that used that same header." It also
  "provides the status of a request at the current time and not the status of the original
  request." So a replayed refund that has since moved from PENDING to COMPLETED comes back as
  COMPLETED.
- "When you omit the PayPal-Request-Id header from a request, PayPal duplicates the request."
- "When you send two simultaneous API requests with same PayPal-Request-Id header, PayPal processes
  the first request and might fail the second request." In practice this is 409
  `RESOURCE_CONFLICT` / `PREVIOUS_REQUEST_IN_PROGRESS`.
- "The PayPal-Request-Id header value must be unique for both each request and an API call type."
- "PayPal recommends that you use the UUID standard" (a 38 single-byte character limit is cited).
  The Orders SDK documents max length 108. Use `crypto.randomUUID()` (36 chars).
- A retry is safe "for as long as the server stores the ID" for "network timeouts or HTTP 5xx".
- Responses page: "An HTTP 5xx or network timeout from an /execute or /capture endpoint could have
  resulted in the creation of a PayPal transaction ... repeat the same ... call at least once, with
  the same PayPal-Request-Id HTTP header as before."
- **UNVERIFIED:** the response when the same key is sent with a different body or path. Never do
  it. Treat one key as one immutable request.

## Other request headers

- `Prefer: return=minimal` (default) returns `id`, `status` and HATEOAS links. Use
  `Prefer: return=representation` for the full resource. Settlix sends `representation` on
  create, capture and refund.
- `PayPal-Partner-Attribution-Id` is the BN code. It is "Required for multiparty payments" and
  identifies a PayPal partner. Settlix is a single merchant, so **do not send it**.
- `PayPal-Auth-Assertion` is a JWT for acting on behalf of another merchant. It is not used by
  Settlix.
- `PayPal-Mock-Response` is for sandbox negative testing only. See `sandbox-testing.md`.
- `PayPal-Client-Metadata-Id` is a risk correlation ID, optional on create and capture. Not needed.

## Settlix retry classification (policy derived from the docs above)

| Observation | Did PayPal act? | Action |
| --- | --- | --- |
| 2xx with a parseable body | yes | apply `status` (201 created, 200 replay, 202 async: still pending) |
| 202 Accepted | not finished | treat as pending. Poll GET. Keep the same key for any retry |
| 400 `INVALID_REQUEST` | no | fix the request (bug). Mark failed |
| 401 | no (not authenticated) | refresh the token **once**, retry with the **same** key. A second 401 is a config error |
| 403 `NOT_AUTHORIZED` / `PERMISSION_DENIED` | no | mark failed. Check credentials and app |
| 404 `RESOURCE_NOT_FOUND` | no | mark failed. Wrong ID type (order vs capture) or wrong environment |
| 409 `PREVIOUS_REQUEST_IN_PROGRESS` | **unknown / in progress** | wait and retry with the **same** key. Mark the refund `RECOVERY_REQUIRED` until resolved |
| 422 `UNPROCESSABLE_ENTITY` | no | mark failed with `details[0].issue` |
| 429 `RATE_LIMIT_REACHED` | no | exponential backoff with the same key. Honor `Retry-After` if sent |
| 500 / 503 on POST | **unknown** | `RECOVERY_REQUIRED`. Retry with the same key and backoff, then reconcile with GET |
| network error, `AbortError`/timeout, body unreadable | **unknown** | same as 5xx |
| 5xx on GET | n/a (read-only) | retry with backoff |

Backoff suggestion (Settlix, not a PayPal rule): 3 attempts at about 1 s, 4 s and 15 s with
jitter, then hand off to a reconciliation job. Never retry from the browser. The browser asks the
server, and the server owns the key.

## Error body

All REST errors except Identity/OAuth errors use this shape:
```json
{
  "name": "UNPROCESSABLE_ENTITY",
  "message": "The requested action could not be performed, semantically incorrect, or failed business validation.",
  "debug_id": "90bff07028f7f",
  "details": [
    { "field": "/amount/value", "value": "1.234", "location": "body",
      "issue": "DECIMAL_PRECISION", "description": "..." }
  ],
  "links": [{ "href": "https://developer.paypal.com/docs/api/payments/v2/#error-...", "rel": "information_link" }]
}
```
- `name`, `message` and `debug_id` are required. `details[].issue` is required inside each detail.
  "The fields returned in the details array vary by error."
- `description` "can change over the lifetime of an API, so clients must not depend on this
  value." Branch on `issue`.
- Do not hard-match `name` for business errors. An official refund 422 example spells it
  `UNPROCCESSABLE_ENTITY`.
- Identity (OAuth) errors use `{ "error": "invalid_client", "error_description": "Client
  Authentication failed" }`.

HTTP status map (from /api/rest/responses):

| HTTP | `name` | typical cause |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | malformed or schema violation (validation errors) |
| 401 | `AUTHENTICATION_FAILURE` (OAuth: `INVALID_CLIENT` ...) | missing, invalid or expired token, wrong environment credentials |
| 403 | `NOT_AUTHORIZED` | insufficient permissions or scope |
| 404 | `RESOURCE_NOT_FOUND` | unknown ID |
| 405 | `METHOD_NOT_SUPPORTED` | wrong verb |
| 406 | `MEDIA_TYPE_NOT_ACCEPTABLE` | bad `Accept` |
| 409 | `RESOURCE_CONFLICT` | conflicting request in progress |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | bad `Content-Type` |
| 422 | `UNPROCESSABLE_ENTITY` | business validation |
| 429 | `RATE_LIMIT_REACHED` | rate limited |
| 500 | `INTERNAL_SERVER_ERROR` | PayPal-side error |
| 503 | `SERVICE_UNAVAILABLE` | maintenance |

## Logging rules

- Log: Settlix IDs, PayPal order, capture and refund IDs, HTTP status, `name`, `details[].issue`,
  `debug_id`, and the `PayPal-Request-Id`. The request ID is a nonce, not a secret.
- Never log: the `Authorization` header, access tokens, client secret, Basic credentials, full
  request or response headers, buyer email, name or address, or `transmission_sig`/`cert_url`
  dumps.
- PayPal support asks for `debug_id` (also "debug_id or correlation_id from the response header").
  The exact header name is UNVERIFIED here, so use the body `debug_id`.
