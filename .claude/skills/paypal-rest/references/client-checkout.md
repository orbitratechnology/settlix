# Buyer approval on the client (JS SDK v6, React)

Sources:
- https://developer.paypal.com/sdk/js/set-up
- https://developer.paypal.com/sdk/js/reference
- https://developer.paypal.com/sdk/react/reference
- https://developer.paypal.com/v5-v6
- https://developer.paypal.com/checkout/integrate
- github.com/paypal/paypal-js (`packages/react-paypal-js/README.md`, `packages/paypal-js` README)
- npm registry metadata, fetched 2026-10-21

## What is current

| Package / script | Version on npm (2026-10-21) | Status |
| --- | --- | --- |
| `@paypal/react-paypal-js` | **10.6.0** (`latest`, published 2026-10-05). The `alpha` tag is 9.0.0-alpha.12, which is older | **Recommended for Settlix.** Use the **`/sdk-v6`** entry point. The root entry is the legacy v5 API |
| `@paypal/paypal-js` | **11.3.0** (`latest`, 2026-10-20). react-paypal-js 10.6.0 depends on `^11.2.1` | framework-agnostic loader. v6 entry is `@paypal/paypal-js/sdk-v6` (`loadCoreSdkScript`) |
| JS SDK v6 script | `https://www.sandbox.paypal.com/web-sdk/v6/core` (sandbox), `https://www.paypal.com/web-sdk/v6/core` (live) | current |
| JS SDK v5 script `https://www.paypal.com/sdk/js?client-id=...` | n/a | PayPal's upgrade guide labels it "(deprecated)" |

- `@paypal/react-paypal-js` 10.6.0 has peer dependencies `react` and `react-dom` at
  `^16.8.0 || ^17 || ^18 || ^19`. Its dependencies are `@paypal/paypal-js`,
  `@paypal/sdk-constants` and `server-only`. Its exports are `.`, `./sdk-v6` and
  `./sdk-v6/server`.
- Install with Bun, pinned: `bun add @paypal/react-paypal-js@10.6.0`.

## Authentication in the browser

- PayPal recommends the **client ID** for most integrations. The set-up guide says "This static
  client ID value is safe to include in your front-end code". The **client token** option is
  "for Fastlane only".
- v6 needs an explicit environment. The react-paypal-js README says "`clientId` does not select the
  environment in v6 — this prop does." Settlix always passes `environment="sandbox"`.
- The default `test` client ID from v5 days is not accepted by v6 (v5-v6 troubleshooting).
- Expose only `NEXT_PUBLIC_PAYPAL_CLIENT_ID`. The secret, access tokens, webhook ID and any request
  IDs stay on the server.

## Server round-trip pattern

1. `createOrder` POSTs to **your** route with only the Settlix order ID. The server loads the
   order, computes the amount, calls `POST /v2/checkout/orders`, persists the PayPal order ID and
   the capture request ID, and returns `{ orderId }`. In v6 `createOrder` must return
   `{ orderId }`, not a bare string.
2. The buyer approves in a popup, modal or redirect (`presentationMode`, default `"auto"`).
3. `onApprove({ orderId, payerId })` POSTs to **your** capture route. The server checks that the
   PayPal order belongs to that Settlix order, captures with the stored `PayPal-Request-Id`, checks
   `captures[0].status === "COMPLETED"` and the amount, and stores the **capture ID**.
4. `onCancel` keeps the Settlix order unpaid. `onError` shows a generic message. Never show raw
   PayPal errors.

## Next.js 16 App Router example (client component)

```tsx
// app/checkout/[orderId]/paypal-checkout.tsx
"use client";

import {
  PayPalProvider,
  PayPalOneTimePaymentButton,
} from "@paypal/react-paypal-js/sdk-v6";

export function PayPalCheckout({ settlixOrderId }: { settlixOrderId: string }) {
  return (
    <PayPalProvider
      clientId={process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID!}
      environment="sandbox"               // Settlix: sandbox only, hard-coded
      components={["paypal-payments"]}
      pageType="checkout"
    >
      <PayPalOneTimePaymentButton
        createOrder={async () => {
          // Server computes the amount; the browser sends no money values.
          const res = await fetch(`/api/checkout/${settlixOrderId}/paypal-order`, { method: "POST" });
          if (!res.ok) throw new Error("Could not start PayPal checkout");
          const { orderId } = (await res.json()) as { orderId: string };
          return { orderId };
        }}
        onApprove={async ({ orderId }) => {
          const res = await fetch(`/api/checkout/${settlixOrderId}/paypal-order/${orderId}/capture`, { method: "POST" });
          if (!res.ok) throw new Error("Payment could not be completed");
          // navigate to the receipt page; it reads state from the DB, not from this response
        }}
        onCancel={() => { /* buyer closed the PayPal window */ }}
        onError={(err) => { console.error("paypal_button_error", err); }}
      />
    </PayPalProvider>
  );
}
```

- Other props on the common button: `orderId` (static, instead of `createOrder`),
  `presentationMode` (`"auto" | "popup" | "modal" | "redirect"`), `type`
  (`"pay" | "checkout" | "buynow" | "donate" | "subscribe"`), `disabled` and `onComplete`.
- Loading state comes from `usePayPal()`, which returns `{ loadingStatus, error }` and
  `INSTANCE_LOADING_STATE.PENDING | REJECTED` (a runtime enum, so import it as a value).
- Eligibility: `useEligibleMethods()` returns
  `eligiblePaymentMethods?.isEligible("paypal")`. For SSR, use `fetchEligibleMethods` from
  `@paypal/react-paypal-js/sdk-v6/server` in a server component and pass the result to
  `PayPalProvider` as `eligibleMethodsResponse`. It needs a server-side access token. Optional for
  Settlix.
- `testBuyerCountry` (sandbox only) is a provider prop for testing other buyer countries.

## Vanilla v6 (reference only)

```js
const sdk = await window.paypal.createInstance({ clientId, components: ["paypal-payments"], pageType: "checkout" });
const methods = await sdk.findEligibleMethods({ currencyCode: "USD" });
if (methods.isEligible("paypal")) {
  const session = sdk.createPayPalOneTimePaymentSession({ onApprove, onCancel, onError });
  button.addEventListener("click", async () => {
    // Do NOT await createOrder() before start(): pass the promise (transient activation)
    await session.start({ presentationMode: "auto" }, createOrder());
  });
}
```
The v5-to-v6 guide says "v6 buttons are hidden by default". Remove the `hidden` attribute after
the eligibility check. Initialize inside the script tag's `onload`, not inline or in
`DOMContentLoaded`.

## Sandbox buyer

Log in to the PayPal window with the **personal** sandbox account from Dashboard > Testing Tools >
Sandbox Accounts. Payments land in the **business** sandbox account tied to the REST app.
