# Sandbox testing

Sources:
- https://developer.paypal.com/sandbox-testing/overview
- https://developer.paypal.com/sandbox-testing/accounts
- https://developer.paypal.com/api/rest/ (section 3, sandbox credentials)
- https://developer.paypal.com/negative-testing/overview
- https://developer.paypal.com/negative-testing/request-headers
- https://developer.paypal.com/checkout/integrate (negative-testing table)
- https://developer.paypal.com/checkout/refund-payment (negative-testing table)
- https://developer.paypal.com/sandbox-testing/card-testing
- https://developer.paypal.com/api/rest/webhooks/simulator

## Accounts

- A developer account automatically gets one **Business** sandbox account (the merchant, with
  REST test credentials, `sb-xxxx@business.example.com`) and one **Personal** sandbox account (the
  buyer, `sb-xxxx@personal.example.com`). You cannot delete those defaults.
- To create more: Developer Dashboard > **Testing Tools > Sandbox Accounts** (also shown as
  Sandbox > Accounts) > **Create account**. Pick Personal or Business and a country. Use "Create
  Custom Account" for custom balances. You can also **Duplicate** (clone) an account. The password
  is not cloned, and a cloned business account loses Pro status and account-manager flags.
- View credentials with **⋮ > View/Edit Account**, which shows the email and generated password.
- Buyer flow: in the PayPal popup, log in with the **personal** sandbox account. Check balances and
  transactions at https://www.sandbox.paypal.com. Use the business account for the merchant view.
  Sandbox emails never leave the sandbox. They appear on the account's **Notifications** page.
- The REST app's client ID and secret come from **Apps & Credentials** with the Sandbox toggle on.
  The sandbox and live credentials are different. Using live credentials against the sandbox gives
  401 `invalid_client`.
- Some features do not apply to the sandbox (closing accounts, monthly statements, shipping
  preferences, PayPal Shops). The API feature set is the same as live.

## Negative testing (beta, sandbox only)

- It works only in sandbox, and the overview says only with **business** accounts. The checkout
  and refund guides also say to switch **Negative Testing** to **On** for the sandbox business
  account: Sandbox Accounts > ⋮ > View/Edit Account > Settings.
- For REST, add this header to the call:
  ```
  PayPal-Mock-Response: {"mock_application_codes": "<ISSUE_CODE>"}
  ```
  Example from the docs:
  ```bash
  curl -X POST https://api-m.sandbox.paypal.com/v2/checkout/orders/7WH94211LK834082R/capture \
    -H 'Authorization: Bearer <Access-Token>' \
    -H 'Content-Type: application/json' \
    -H 'PayPal-Mock-Response: {"mock_application_codes": "DUPLICATE_INVOICE_ID"}'
  ```
  It returns a normal error body (`name: "UNPROCESSABLE_ENTITY"`, `details[0].issue:
  "DUPLICATE_INVOICE_ID"`, `debug_id`, `links`). "If you do not use the specific test values, the
  service returns the actual API responses."
- Operations that support the header:
  - Payments v2: show authorization, capture authorization, void authorization, **show capture**,
    **refund capture**, **show refund**.
  - Orders v2: **create**, update (PATCH), **show**, authorize, **capture**.
- The server SDK exposes the same header as the `paypalMockResponse` parameter.

Mock codes PayPal lists in its guides:

| Flow | Code | Documented result |
| --- | --- | --- |
| create/capture | `INSUFFICIENT_FUNDS` | buyer cannot pay at capture (code appears only in the quickstart table, not in the Orders error catalog) |
| capture | `INSTRUMENT_DECLINED` | payment method declined at capture |
| capture | `TRANSACTION_REFUSED` | transaction refused at capture |
| create/capture | `INTERNAL_SERVER_ERROR` | HTTP 500 |
| create | `DUPLICATE_INVOICE_ID` | invoice ID must be unique (the docs example uses it on capture) |
| refund | `REFUND_AMOUNT_EXCEEDED` | refund amount exceeds capture |
| refund | `CAPTURE_FULLY_REFUNDED` | already fully refunded |
| refund | `REFUND_NOT_ALLOWED_AFTER_180_DAYS` | refund period expired (guide-only code. The API catalog uses `REFUND_TIME_LIMIT_EXCEEDED`) |
| refund | `PERMISSION_DENIED` | 403 |
| refund | `INTERNAL_SERVER_ERROR` | 500 |

PayPal's request-headers page says the available codes are the ones in the Payments and Orders
error catalogs: Payments v2 `x-errors` in `/api/payments/v2/schema.json`, and
https://developer.paypal.com/api/orders/v2/error-messages. Only the codes in the table above are
explicitly shown working. **Try any other code in sandbox before you rely on it.**

Settlix rules for mock headers:
- Only send the header when `PAYPAL_NEGATIVE_TESTING=1` on the server and the base URL is sandbox.
- The browser must never be able to choose or inject a mock code.
- Treat `INTERNAL_SERVER_ERROR` mocks as unknown-outcome tests. The refund row must end in
  `RECOVERY_REQUIRED` and then be reconciled. It must never be retried with a new request ID.

## Things negative testing cannot simulate

- **Timeouts and lost responses.** To test "PayPal did it but we never heard back", call refund
  with a very short client timeout (`AbortSignal.timeout(1)`) or kill the request after sending,
  then run the reconciliation. The replay with the same `PayPal-Request-Id` should return the
  existing refund, not a second one.
- **PENDING refunds.** In sandbox "refunds complete instantly" (refund guide), so `PENDING` is
  hard to reach. Unit-test the PENDING branch with fixtures.
- **Webhook signatures for mock events.** Simulator events cannot be verified by postback.
  Exercise real sandbox events (make a sandbox payment and refund) to test postback verification.

## Card testing (only if Settlix ever adds card fields)

The card-testing page lists static test numbers (for example Visa `4012888888881881`) and
rejection triggers typed in the name field, such as `CCREJECT-REFUSED` (processor code `0500`
DO_NOT_HONOR), `CCREJECT-SF` and `CCREJECT-EC`. These are for Expanded Checkout card flows, not the
PayPal-wallet button.

## Useful dashboards

- Sandbox Accounts: https://developer.paypal.com/dashboard/accounts
- Webhooks simulator: https://developer.paypal.com/dashboard/webhooksSimulator/ (mock events, HTTPS:443 listener)
- Sandbox site (transactions, balances, notifications): https://www.sandbox.paypal.com
