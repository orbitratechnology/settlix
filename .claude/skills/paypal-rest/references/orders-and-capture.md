# Orders v2: create, get, capture

Source of truth: https://developer.paypal.com/api/orders/v2/schema.json (v2.36, 2026-10-21) and
https://developer.paypal.com/api/orders/v2/error-messages. Retention text for PayPal-Request-Id is
from github.com/paypal/paypal-rest-api-specifications `openapi/checkout_orders_v2.json` (v2.32) and
the @paypal/paypal-server-sdk 2.5.0 docs.

## Create order: `POST /v2/checkout/orders`

Headers:
```
Authorization: Bearer <token>
Content-Type: application/json
PayPal-Request-Id: <uuid stored on the Settlix order attempt>   # keys kept 6h by default (up to 72h via account manager)
Prefer: return=representation                                   # default is return=minimal (id, status, links only)
```
Body, the minimal Settlix shape. **The amount is computed on the server from the DB.**
```json
{
  "intent": "CAPTURE",
  "purchase_units": [
    {
      "reference_id": "ord_8f3c...",
      "custom_id": "ord_8f3c...",
      "description": "Settlix order ord_8f3c...",
      "amount": { "currency_code": "USD", "value": "19.99" }
    }
  ]
}
```
Field rules from the schema:
- `intent` is required and is `CAPTURE` or `AUTHORIZE`. Settlix uses `CAPTURE`.
- `purchase_units` is required and holds 1 to 10 units. Settlix uses exactly 1.
- `amount` is required. `amount.value` is a string matching
  `^((-?[0-9]+)|(-?([0-9]+)?[.][0-9]+))$`, max 32 chars. Use 2 decimals for USD/EUR/GBP and 0 for
  JPY/HUF/TWD (https://developer.paypal.com/reference/currency-codes). The error
  `DECIMAL_PRECISION` means "only two decimal place precision is supported".
- If you send `amount.breakdown`, the totals must add up: `item_total + tax_total + shipping +
  handling + insurance - shipping_discount - discount`. Otherwise you get `AMOUNT_MISMATCH` /
  `ITEM_TOTAL_MISMATCH`. Settlix can omit `breakdown` and `items`.
- `reference_id` is max 256 and defaults to `"default"`. `custom_id` is max 255 and not visible to
  the payer. `invoice_id` is max 127 and visible to the payer. **invoice_id must be unique per
  merchant account by default.** Reusing it (for example, a second PayPal order for the same
  Settlix order) can fail with `DUPLICATE_INVOICE_ID`. `description` is truncated to 127 chars in
  responses.
- Optional payer experience goes in `payment_source.paypal.experience_context`:
  `shipping_preference` (`GET_FROM_FILE | NO_SHIPPING | SET_PROVIDED_ADDRESS`), `user_action`
  (`CONTINUE | PAY_NOW`), `brand_name`, `landing_page`, `return_url`, `cancel_url`. The top-level
  `application_context` fields are **DEPRECATED**. Before adding `payment_source` to a JS-SDK
  button flow, check it in sandbox. The quickstart sends only `intent` and `purchase_units`.

Responses:
- `201` means created. With `Prefer: return=representation` you get the full order. The default
  is minimal: `id`, `status`, `links`.
- `200` is "a successful response to an idempotent request", meaning a replay with the same
  `PayPal-Request-Id`.
- `202` means accepted but not complete (async). Poll `GET /v2/checkout/orders/{id}`.
- Errors: 400 `INVALID_REQUEST`, 401, 403, 409 `RESOURCE_CONFLICT`/`PREVIOUS_REQUEST_IN_PROGRESS`,
  422 `UNPROCESSABLE_ENTITY`, 500.

Return only `{ orderId: order.id }` to the browser. Persist `paypal_order_id`, the request ID, the
amount and currency on the Settlix order attempt.

Order lifetime: the `links` description says the caller has 6 hours by default (24, 48 or 72 via
an account manager) from creation to redirect the payer. Once redirected, there are 6 hours for
the payer to approve and for you to capture.

## Show order: `GET /v2/checkout/orders/{id}`

`status` is one of:

| status | meaning (schema) |
| --- | --- |
| `CREATED` | created with the specified context |
| `SAVED` | saved/persisted (not used with intent CAPTURE + JS SDK) |
| `APPROVED` | buyer approved; ready to capture |
| `VOIDED` | all purchase units voided |
| `COMPLETED` | intent completed and a payments resource was created. **Check `purchase_units[].payments.captures[].status` before fulfilling**, because a completed order can also mean a declined payment |
| `PAYER_ACTION_REQUIRED` | redirect payer to the `rel: "payer-action"` link (e.g. 3DS) |

`purchase_units[].payments` holds `authorizations[]`, `captures[]` and `refunds[]`. Refunds there
include `id`, `status`, `amount`, `invoice_id` and `custom_id`. That is the one place where the
refunds of an order are listed.

## Capture order: `POST /v2/checkout/orders/{id}/capture`

Headers:
```
Authorization: Bearer <token>
Content-Type: application/json
PayPal-Request-Id: <uuid persisted BEFORE the call, reused by onApprove route AND webhook fallback>
Prefer: return=representation
```
Body: `{}`. The schema example "Capture Order - PayPal Wallet as Payment Source" uses `{}`.

Response, abridged from the official 201 example:
```json
{
  "id": "5O190127TN364715T",                   // ORDER id (not the capture id!)
  "status": "COMPLETED",                       // ORDER status
  "purchase_units": [{
    "reference_id": "d9f80740-38f0-11e8-b467-0ed5f89f718b",
    "payments": {
      "captures": [{
        "id": "3C679366HH908993F",             // CAPTURE id -> store it, refunds need it
        "status": "COMPLETED",                 // CAPTURE status -> this decides "paid"
        "amount": { "currency_code": "USD", "value": "100.00" },
        "final_capture": true,
        "seller_receivable_breakdown": {
          "gross_amount": { "currency_code": "USD", "value": "100.00" },
          "paypal_fee":   { "currency_code": "USD", "value": "3.00" },
          "net_amount":   { "currency_code": "USD", "value": "97.00" }
        },
        "links": [
          { "rel": "self",   "method": "GET",  "href": ".../v2/payments/captures/3C679366HH908993F" },
          { "rel": "refund", "method": "POST", "href": ".../v2/payments/captures/3C679366HH908993F/refund" }
        ]
      }]
    }
  }],
  "payer": { "payer_id": "QYR5Z8XDVJNXQ", "email_address": "customer@example.com" }
}
```
HTTP outcomes:
- `201` means captured.
- `200` means an idempotent replay ("If a duplicate response is retried, returns the HTTP 200 OK").
- `202` means accepted, async. Treat it as pending and poll GET order.
- `207` means a multi-status result for multiple purchase units. Settlix uses one unit, but handle
  it defensively as uncertain.
- `409` means the order or purchase unit is in a state that prevents capture, or a previous request
  is in progress.
- `422` is a business error (below).

### Capture status (`purchase_units[].payments.captures[].status`)

| status | Settlix action |
| --- | --- |
| `COMPLETED` | funds credited to payee, so mark paid after verifying amount and currency against the DB |
| `PENDING` | not yet credited. Read `status_details.reason` and wait for `PAYMENT.CAPTURE.COMPLETED` or poll `GET /v2/payments/captures/{id}` |
| `DECLINED` | funds could not be captured, so not paid |
| `FAILED` | error while capturing, so not paid |
| `PARTIALLY_REFUNDED` / `REFUNDED` | later states after refunds |

`status_details.reason` is one of: `BUYER_COMPLAINT`, `CHARGEBACK`, `ECHECK`,
`INTERNATIONAL_WITHDRAWAL`, `OTHER`, `PENDING_REVIEW`,
`RECEIVING_PREFERENCE_MANDATES_MANUAL_ACTION`, `REFUNDED`,
`TRANSACTION_APPROVED_AWAITING_FUNDING`, `UNILATERAL`, `VERIFICATION_REQUIRED`,
`DECLINED_BY_RISK_FRAUD_FILTERS`. Sandbox note: receiving a currency the business account does
not hold leaves the payment pending until it is manually accepted, unless the account's payment
receiving preferences allow it (currency-codes page).

### Capture errors worth handling

These are from the "Capture order" section of the Orders error-messages page. The actions come
from /api/errors/overview where it gives one.

| issue (`details[0].issue`) | name | Settlix action |
| --- | --- | --- |
| `ORDER_ALREADY_CAPTURED` | UNPROCESSABLE_ENTITY | "No action needed." `GET` the order and read the capture ID/status |
| `ORDER_NOT_APPROVED` | UNPROCESSABLE_ENTITY | buyer has not approved, so ask them to complete checkout again |
| `INSTRUMENT_DECLINED` | UNPROCESSABLE_ENTITY | funding declined, so let the buyer choose another funding source (restart checkout). v6 restart API: UNVERIFIED |
| `REDIRECT_PAYER_FOR_ALTERNATE_FUNDING` | UNPROCESSABLE_ENTITY | same as above |
| `PAYER_ACTION_REQUIRED` | UNPROCESSABLE_ENTITY | buyer must return to PayPal (`payer-action` link) |
| `PAYER_CANNOT_PAY`, `TRANSACTION_REFUSED`, `PAYEE_BLOCKED_TRANSACTION`, `COMPLIANCE_VIOLATION`, `MAX_NUMBER_OF_PAYMENT_ATTEMPTS_EXCEEDED` | UNPROCESSABLE_ENTITY | not paid. Show a generic failure and allow another method |
| `DUPLICATE_INVOICE_ID` | UNPROCESSABLE_ENTITY | `invoice_id` reused. Fix the ID strategy |
| `ORDER_COMPLETION_IN_PROGRESS` | UNPROCESSABLE_ENTITY | only for `ORDER_COMPLETE_ON_PAYMENT_APPROVAL`. Poll GET |
| `PREVIOUS_REQUEST_IN_PROGRESS` | RESOURCE_CONFLICT (409) | wait, then retry with the **same** request ID |
| `INVALID_RESOURCE_ID` | RESOURCE_NOT_FOUND (404) | wrong order ID or wrong REST app/environment |
| `PERMISSION_DENIED` | NOT_AUTHORIZED (403) | wrong credentials or account for this order |

### Capture recovery (uncertain outcome)

1. Retry `POST .../capture` with the **same** `PayPal-Request-Id` and the same body. PayPal's
   Responses page: "An HTTP 5xx or network timeout from an /execute or /capture endpoint could
   have resulted in the creation of a PayPal transaction ... repeat the same /execute or /capture
   call at least once, with the same PayPal-Request-Id."
2. If the 6-hour key window has passed, or you still get no answer, call `GET
   /v2/checkout/orders/{id}`. `payments.captures[]` gives the truth. A second capture attempt on an
   intent-CAPTURE order returns `ORDER_ALREADY_CAPTURED`, so a double capture is prevented on
   PayPal's side.
3. Settlix: use the same stored capture request ID in both the `onApprove` route and any
   `CHECKOUT.ORDER.APPROVED` webhook fallback.
