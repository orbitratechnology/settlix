# Payments v2: refunds

Source of truth: https://developer.paypal.com/api/payments/v2/schema.json (v2.12; operations
`captures.refund`, `refunds.get`, `captures.get`; schemas `refund_request`, `refund`,
`refund_status`, `capture`; error catalog `x-errors`). Also
https://developer.paypal.com/checkout/refund-payment and
https://developer.paypal.com/api/rest/requests/ (45-day key retention).

## Refund a capture: `POST /v2/payments/captures/{capture_id}/refund`

`capture_id` is the **capture** ID from `purchase_units[].payments.captures[].id`, never the
order ID.

Headers:
```
Authorization: Bearer <token>
Content-Type: application/json
PayPal-Request-Id: <uuid persisted on the Settlix refund row BEFORE this call>   # server keeps it 45 days
Prefer: return=representation      # default return=minimal returns only id, status, links
```

Body (`refund_request`, every field optional):

| field | type / limit | notes |
| --- | --- | --- |
| `amount` | Money `{ value, currency_code }` | If omitted, PayPal refunds "captured amount - previous refunds". Must be positive and in the capture currency |
| `custom_id` | string 1..127 | Settlix refund ID. The response schema pattern is `^[A-Za-z0-9-_.,]*$`, so keep to those chars (UUIDs are fine) |
| `invoice_id` | string 1..127 | optional. Reusing a refunded `invoice_id` can yield `DUPLICATE_REFUND` |
| `note_to_payer` | string 1..255 | shown in the payer's history and emails |
| `payment_instruction` | object | marketplaces/platforms only. Not for Settlix |

Full refund (remaining balance):
```json
{}
```
Partial refund, which is the **Settlix default: always explicit**:
```json
{ "amount": { "value": "10.99", "currency_code": "USD" }, "custom_id": "rfd_5b1e...", "note_to_payer": "Defective product" }
```

### Response (`refund`)

```json
{
  "id": "1JU08902781691411",
  "status": "COMPLETED",
  "amount": { "value": "10.99", "currency_code": "USD" },
  "note_to_payer": "Defective product",
  "invoice_id": "INVOICE-123",
  "custom_id": "RefundCustom-123",
  "seller_payable_breakdown": {
    "gross_amount":          { "value": "10.99", "currency_code": "USD" },
    "paypal_fee":            { "value": "0",     "currency_code": "USD" },
    "net_amount":            { "value": "10.99", "currency_code": "USD" },
    "total_refunded_amount": { "value": "10.99", "currency_code": "USD" }
  },
  "create_time": "2018-09-11T23:24:19Z",
  "update_time": "2018-09-11T23:24:19Z",
  "links": [
    { "rel": "self", "method": "GET", "href": "https://api-m.paypal.com/v2/payments/refunds/1JU08902781691411" },
    { "rel": "up",   "method": "GET", "href": "https://api-m.paypal.com/v2/payments/captures/2GG279541U471931P" }
  ]
}
```
- `total_refunded_amount` is cumulative for the capture. Example from the schema: $20 earlier plus
  $30 now gives `gross_amount` $30 and `total_refunded_amount` $50.
- `paypal_fee` can be `"0"` with no decimals, so your parser must accept integers.
- Other fields: `status_details.reason`, `acquirer_reference_number` (cards) and `payer`.
- HTTP `201` means created. HTTP `200` is documented by the example "Refund Captured Payment - 200
  idempotent response", a replay. Do **not** depend on 200 vs 201 for correctness. Use `status`.

### Refund status

| `status` | meaning | Settlix state |
| --- | --- | --- |
| `COMPLETED` | refunded | `REFUNDED`. **Only this counts as refunded** |
| `PENDING` | in progress (`status_details.reason`, documented enum: `ECHECK`) | `PENDING`. Wait for `PAYMENT.CAPTURE.REFUNDED` or poll GET refund |
| `FAILED` | did not happen (e.g. `PAYMENT.REFUND.FAILED`: bank settlement failed) | `FAILED`. No money moved |
| `CANCELLED` | cancelled | `FAILED`/`CANCELLED`. No money moved |

PayPal's refund guide: "Processed refunds cannot be cancelled." Refunds go back to the original
payment method, in the capture currency. In sandbox "refunds complete instantly". Refund within
180 days of capture.

## Show refund: `GET /v2/payments/refunds/{refund_id}`

Returns the same `refund` object. Errors are 401, 403, 404 (`RESOURCE_NOT_FOUND` /
`INVALID_RESOURCE_ID`) and 500.

## Show capture: `GET /v2/payments/captures/{capture_id}`

Returns the capture:
- `id`, `status`, `status_details`, and `amount` (the captured amount).
- `seller_receivable_breakdown` (`gross_amount`, `paypal_fee`, `net_amount`, ...). It is "not
  available for transactions that are in pending state".
- `invoice_id`, `custom_id` and `final_capture`.
- `supplementary_data.related_ids.order_id`.
- `links` (`self`, `refund`, `up`).

After refunds, `status` becomes `PARTIALLY_REFUNDED` ("an amount less than this captured payment's
amount was partially refunded") or `REFUNDED` ("an amount greater than or equal to this captured
payment's amount was refunded"). The capture object does **not** list refunds or a refunded total.
For a list, use `GET /v2/checkout/orders/{order_id}` and read `purchase_units[].payments.refunds[]`,
which includes `id`, `status`, `amount` and `custom_id` per the Orders schema. You can also take
`seller_payable_breakdown.total_refunded_amount` from the latest refund.

## Error `issue` codes relevant to refunds

All of these appear in the Payments v2 `x-errors` catalog. The catalog gives name and message but
**no HTTP status per code**. The schema's refund examples show 422 for `REFUND_AMOUNT_EXCEEDED`
and `TRANSACTION_DISPUTED`, and 409 for `PREVIOUS_REQUEST_IN_PROGRESS`. The refund guide maps
`PERMISSION_DENIED` to 403. Branch on `details[0].issue`.

| issue | catalog text (abridged) | Settlix handling |
| --- | --- | --- |
| `CAPTURE_FULLY_REFUNDED` | capture already fully refunded | definitive. GET the capture/order and reconcile. Likely an earlier refund already succeeded |
| `CAPTURED_AMOUNT_FULLY_REFUNDED` | captured amount already fully refunded | same as above |
| `REFUND_AMOUNT_EXCEEDED` | refund must be at most the unrefunded capture amount | definitive. Recompute the remaining amount |
| `MAX_REFUND_LIMIT_EXCEEDED` | exceeds allowable limit | definitive |
| `PARTIAL_REFUND_NOT_ALLOWED` | send the full amount or omit `amount` | definitive |
| `REFUND_TIME_LIMIT_EXCEEDED` | "The refund cannot be issued at this time." | definitive. Manual process |
| `REFUND_TIME_EXCEEDED_FOR_PAYMENT_SOURCE` | payment-source time limit expired | definitive. Contact the payer |
| `MAX_NUMBER_OF_REFUNDS_EXCEEDED` | too many refunds per capture | definitive |
| `REFUND_NOT_ALLOWED` | cannot refund this capture | definitive |
| `REFUND_NOT_SUPPORTED_FOR_PAYMENT_SOURCE` / `REFUND_FAILED_BY_PAYMENT_SOURCE` | payment source cannot be refunded | definitive |
| `REFUND_CAPTURE_CURRENCY_MISMATCH` / `REFUND_CURRENCY_MISMATCH` | currency must equal capture currency | definitive (bug) |
| `REFUND_AMOUNT_TOO_LOW` | zero after currency conversion | definitive |
| `REFUND_FAILED_INSUFFICIENT_FUNDS` | merchant balance/bank insufficient | definitive. Top up the sandbox business account |
| `REFUND_FUNDS_NOT_AVAILABLE` / `REFUND_REFUSED_BY_PROCESSOR` | no valid or declined funding instrument | definitive |
| `TRANSACTION_DISPUTED` | open dispute blocks partial refund | definitive. Resolve the dispute |
| `REFUND_NOT_PERMITTED_DUE_TO_CHARGEBACK` | chargeback on capture | definitive |
| `PENDING_CAPTURE` | capture still pending (eCheck/bank) | definitive for now. Retry after the capture completes |
| `DUPLICATE_REFUND` | `invoice_id` already refunded | definitive. Reconcile, it may be a duplicate |
| `REFUND_TRANSACTION_REFUSED`, `TRANSACTION_REFUSED` | refused by PayPal controls | definitive |
| `REFUND_IS_RESTRICTED` | only the capturing API caller can refund | definitive (wrong app) |
| `INSTRUMENT_DECLINED` | instrument declined | definitive |
| `PERMISSION_DENIED`, `NOT_AUTHORIZED` | insufficient permissions | definitive (wrong credentials or account) |
| `INVALID_RESOURCE_ID` | resource ID not found | definitive. Wrong capture ID, an order ID passed by mistake, or the wrong environment |
| `PAYEE_ACCOUNT_LOCKED_OR_CLOSED`, `PAYEE_ACCOUNT_RESTRICTED` | merchant account issue | definitive |
| `PREVIOUS_REQUEST_IN_PROGRESS` (409) | previous request on this resource still running | **uncertain**. Wait, then retry with the same request ID |
| `INTERNAL_SERVER_ERROR` (500) | try again later | **uncertain**. Retry with the same request ID |
| `RATE_LIMIT_REACHED` (429) | rate limit | retry later with the same request ID |
| `DECIMAL_PRECISION`, `DECIMALS_NOT_SUPPORTED`, `INVALID_CURRENCY_CODE`, `INVALID_STRING_LENGTH`, `MISSING_REQUIRED_PARAMETER`, `MALFORMED_REQUEST_JSON` | validation (400/422) | definitive (bug) |

Not found in any official source checked, so **UNVERIFIED**: `DUPLICATE_REQUEST_ID` and
`REFUND_EXCEEDED_*`. Only the refund guide's mock table has `REFUND_NOT_ALLOWED_AFTER_180_DAYS`.

## Settlix refund state machine and reconciliation

```
REQUESTED --POST 201/200 status=COMPLETED--> REFUNDED
REQUESTED --POST 201/200 status=PENDING----> PENDING --webhook/GET COMPLETED--> REFUNDED
                                                     --webhook/GET FAILED|CANCELLED--> FAILED
REQUESTED --4xx definitive (400/401-after-refresh/403/404/422)--> FAILED (record issue + debug_id)
REQUESTED --timeout | network error | 5xx | 202 | 409 | unreadable 2xx body--> RECOVERY_REQUIRED
RECOVERY_REQUIRED --replay SAME PayPal-Request-Id + SAME body--> (apply result as above)
```

Recovery procedure. Run it from a job or an admin action, never from the browser.
1. Load the refund row (`paypal_request_id`, `capture_id`, `amount`, `custom_id`).
2. Re-send `POST /v2/payments/captures/{capture_id}/refund` with the **same** `PayPal-Request-Id`
   and the **byte-identical** body, within 45 days. PayPal returns the current status of the refund
   created by the first call, or creates it if the first call never landed. Store `id` and `status`.
3. If that is still uncertain, read the state: `GET /v2/checkout/orders/{order_id}` and look in
   `purchase_units[].payments.refunds[]` for `custom_id === settlixRefundId`. If found, adopt that
   refund's `id` and `status`. Cross-check with `GET /v2/payments/captures/{capture_id}`
   (`REFUNDED`/`PARTIALLY_REFUNDED`).
4. Never create a second refund with a new request ID for the same Settlix refund. If more than
   45 days have passed and the state is still unknown, escalate to a human.
5. Mark `REFUNDED` only when a fetched refund has `status: "COMPLETED"`.
