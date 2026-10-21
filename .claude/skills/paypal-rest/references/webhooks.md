# Webhooks

Sources:
- https://developer.paypal.com/api/rest/webhooks (overview, retries)
- https://developer.paypal.com/api/rest/webhooks/rest (verification)
- https://developer.paypal.com/api/rest/webhooks/event-names
- https://developer.paypal.com/api/rest/webhooks/simulator
- https://developer.paypal.com/api/webhooks/v1/schema.json (`verify-webhook-signature`)
- https://developer.paypal.com/v5/checkout/uncaptured-payments

## Setup

- Subscribe a listener URL to the **sandbox REST app** in the Developer Dashboard's Application
  management (the app's settings), or through the Webhooks Management API (`POST
  /v1/notifications/webhooks`). Record the returned **webhook ID** as `PAYPAL_WEBHOOK_ID` (server
  env only).
- Other useful endpoints: `GET /v1/notifications/webhooks-events` and `GET
  /v1/notifications/webhooks-events/{event_id}` list and show past events. `POST
  /v1/notifications/webhooks-events/{event_id}/resend` resends one. `POST
  /v1/notifications/simulate-event` simulates an event.
- The listener must be HTTPS on port 443. Use a tunnel in local dev. There can be up to 10 URLs
  per app. You can subscribe to specific events or to `*`. You only get events for **that** app.
- Delivery succeeds on any 2xx. On non-2xx, timeout or connection failure, PayPal retries "up to
  25 times over 3 days" and then marks the delivery Failed. It can be resent from the Webhook
  Events dashboard.

## Event types for Settlix

| Event | Trigger (official wording, abridged) |
| --- | --- |
| `CHECKOUT.ORDER.APPROVED` | buyer approved a checkout order (Orders v2) |
| `CHECKOUT.PAYMENT-APPROVAL.REVERSED` | problem after approval but before capture. PayPal cancels the order and refunds the buyer. The default capture window is 3 hours (v5 guide) |
| `CHECKOUT.ORDER.COMPLETED` | "For use by marketplaces and platforms only" |
| `PAYMENT.CAPTURE.COMPLETED` | a payment capture completes |
| `PAYMENT.CAPTURE.PENDING` | capture state changes to pending |
| `PAYMENT.CAPTURE.DECLINED` | a payment capture is declined (the Payments **v2** table uses DECLINED) |
| `PAYMENT.CAPTURE.DENIED` | a payment capture is denied (listed for Payments v1 and marketplaces). Subscribe anyway |
| `PAYMENT.CAPTURE.REFUNDED` | a merchant refunds a payment capture |
| `PAYMENT.CAPTURE.REVERSED` | PayPal reverses a payment capture |
| `PAYMENT.REFUND.PENDING` | refund status changes to pending (for example, eCheck-funded refund) |
| `PAYMENT.REFUND.FAILED` | refund failed (for example, bank settlement fails) |

Event envelope (`event` schema): `id`, `create_time`, `resource_type`, `event_type`, `summary`,
`resource_version`, `event_version`, `resource` and `links`. In the official sample
`PAYMENT.CAPTURE.COMPLETED`, `resource` is the **capture** (`resource.id` is the capture ID,
`resource.status`, `resource.amount`, `resource.supplementary_data.related_ids.order_id`). The
`resource` shape for `PAYMENT.CAPTURE.REFUNDED` and `PAYMENT.REFUND.*` is **not documented** in
the pages checked. Inspect `resource_type` and the `links` (`rel: "up"` / `"self"`), then
re-fetch.

## Verification: postback (`POST /v1/notifications/verify-webhook-signature`)

Request (all fields required):

| field | from |
| --- | --- |
| `auth_algo` | `PAYPAL-AUTH-ALGO` header (e.g. `SHA256withRSA`) |
| `cert_url` | `PAYPAL-CERT-URL` header |
| `transmission_id` | `PAYPAL-TRANSMISSION-ID` header |
| `transmission_sig` | `PAYPAL-TRANSMISSION-SIG` header |
| `transmission_time` | `PAYPAL-TRANSMISSION-TIME` header |
| `webhook_id` | your stored webhook ID (it is **not** in the message) |
| `webhook_event` | the event body, **exactly as received** |

The response is `{ "verification_status": "SUCCESS" | "FAILURE" }`. Accept only `SUCCESS`.

PayPal warns: "It is essential that the webhook_event data be posted back exactly as it was
received ... Parsing to an array/object followed by re-serializing back to a JSON string can fail
verification." So read the raw text and splice it in without re-serialising. See
`verifyWebhookSignature` in `fetch-adapter.md`.

The alternative is self-verification, which PayPal calls preferred because it is faster. Build
`<transmissionId>|<timeStamp>|<webhookId>|<crc32 of raw body, decimal>`, download and cache the
certificate from `paypal-cert-url`, and verify `paypal-transmission-sig` (base64) with SHA256.
Settlix uses postback for simplicity. If you implement self-verify, also check that `cert_url` is
on a PayPal host before downloading it (Settlix hardening, not a PayPal rule).

Simulator (mock) events "cannot be verified by posting back". For self-verification their webhook
ID is the literal string `WEBHOOK_ID`. They are not tied to any app and cannot be resent.

## Next.js App Router listener (sketch)

```ts
// app/api/webhooks/paypal/route.ts
import { verifyWebhookSignature, getCapture, getRefund, PayPalError } from "@/server/paypal";

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();                       // raw body: required for verification
  let ok: boolean;
  try {
    ok = await verifyWebhookSignature(raw, req.headers);
  } catch (err) {
    // PayPal/network problem while verifying -> non-2xx so PayPal retries later
    return new Response("verify unavailable", { status: 503 });
  }
  if (!ok) return new Response("invalid signature", { status: 400 });

  const event = JSON.parse(raw) as { id: string; event_type: string; resource_type?: string; resource?: { id?: string } };

  // 1) dedupe: INSERT INTO paypal_webhook_events(id, event_type, received_at) ... ON CONFLICT (id) DO NOTHING
  //    if the row already existed -> return 200 immediately.
  // 2) enqueue/handle idempotently. Treat the event as a hint: re-fetch authoritative state
  //    (getCapture / getRefund / getOrder) and apply allowed state transitions only.
  //    PAYMENT.CAPTURE.COMPLETED -> GET capture; COMPLETED + amount matches DB -> mark paid
  //    PAYMENT.CAPTURE.REFUNDED / PAYMENT.REFUND.* -> find Settlix refund by PayPal refund id or custom_id; GET refund
  //    CHECKOUT.ORDER.APPROVED -> if not yet captured, capture with the STORED capture PayPal-Request-Id
  // 3) never log headers (they include transmission_sig / cert_url); log event.id + event_type only.
  return new Response(null, { status: 200 });
}
```

Rules:
- Return 2xx quickly. Do the heavy work after persisting the event ID.
- The same event can arrive more than once (retries, manual resend), and events can arrive out of
  order. Use event `id` for dedupe and forward-only state transitions.
- Webhooks never replace the synchronous capture result or the refund reconciliation. They
  complement them, for example for PENDING to COMPLETED.
