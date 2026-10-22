# Recommended typed `fetch` adapter (one module)

This is a Settlix design, not PayPal code. It was type-checked with TypeScript 5.9 (`strict`,
`noUncheckedIndexedAccess`) and smoke-tested with Bun 1.4 against a mocked `fetch` on 2026-10-21:
money conversion, token caching, error classification and raw-body webhook splicing. Every
endpoint, header and field comes from the official specs cited in `SKILL.md`.

Suggested location: `src/server/paypal.ts` (or `lib/paypal/server.ts`). It is server only.

Env (server):
- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` (sandbox REST app).
- `PAYPAL_WEBHOOK_ID`.
- `PAYPAL_BASE_URL`, optional, and it must equal `https://api-m.sandbox.paypal.com`.
- `SETTLIX_TEST_FAULTS=1` (non-production only) to allow mock codes. See `sandbox-testing.md`.

Env (browser): `NEXT_PUBLIC_PAYPAL_CLIENT_ID` only.

Why `fetch` instead of `@paypal/paypal-server-sdk@2.5.0`:
- The SDK has no Webhooks controller, so you would need fetch for verification anyway.
- With fetch, Settlix controls timeouts and gets an explicit *unknown-outcome* error type.
- No `@apimatic/*` or axios dependency tree.
- One file to audit.

The SDK is a valid alternative. It supports `paypalRequestId`, `prefer` and `paypalMockResponse`.

## Error kinds the adapter throws (`PayPalError.kind`)

| kind | when | refund handling | capture handling |
| --- | --- | --- | --- |
| `rejected` | 400/401 (after one token refresh)/403/404/422 | `FAILED` + store `issue`, `debugId` | show failure. `ORDER_ALREADY_CAPTURED` means GET the order and read the capture |
| `retry_later` | 409 `PREVIOUS_REQUEST_IN_PROGRESS`, 429, 5xx/network on GET, OAuth network error | `RECOVERY_REQUIRED`, then retry with the **same** request ID | retry with the same request ID |
| `unknown` | network error, timeout, 5xx or unparseable 2xx on POST | `RECOVERY_REQUIRED`, then reconcile (`refunds.md`) | retry the same request ID, then GET order |

## Module

```ts
import "server-only";

// ---------------------------------------------------------------------------
// Config: Settlix is SANDBOX ONLY.
// ---------------------------------------------------------------------------
const SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com";

function baseUrl(): string {
  const url = process.env.PAYPAL_BASE_URL ?? SANDBOX_BASE_URL;
  if (url !== SANDBOX_BASE_URL) {
    throw new Error("Settlix is sandbox-only: refusing a non-sandbox PAYPAL_BASE_URL");
  }
  return url;
}

function requireEnv(name: "PAYPAL_CLIENT_ID" | "PAYPAL_CLIENT_SECRET" | "PAYPAL_WEBHOOK_ID"): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server env ${name}`);
  return value;
}

// ---------------------------------------------------------------------------
// Money: integer minor units <-> PayPal decimal strings. No floats anywhere.
// ---------------------------------------------------------------------------
const MINOR_EXPONENT = { USD: 2, EUR: 2, GBP: 2, CAD: 2, AUD: 2, JPY: 0 } as const;
export type CurrencyCode = keyof typeof MINOR_EXPONENT;
export interface PayPalMoney {
  currency_code: string;
  value: string;
}

function exponentOf(currency: string): number {
  const exp = (MINOR_EXPONENT as Record<string, number | undefined>)[currency];
  if (exp === undefined) throw new Error(`Unsupported currency ${currency}`);
  return exp;
}

/** 1999 USD -> { currency_code: "USD", value: "19.99" }; 5 -> "0.05"; 500 JPY -> "500" */
export function minorToPayPal(minor: number, currency: CurrencyCode): PayPalMoney {
  if (!Number.isSafeInteger(minor) || minor <= 0) {
    throw new RangeError("amount must be a positive safe integer in minor units");
  }
  const exp = exponentOf(currency);
  if (exp === 0) return { currency_code: currency, value: String(minor) };
  const digits = String(minor).padStart(exp + 1, "0");
  return { currency_code: currency, value: `${digits.slice(0, -exp)}.${digits.slice(-exp)}` };
}

/** { USD, "19.99" } -> 1999; accepts "0", "10", "10.5"; rejects precision loss and negatives. */
export function payPalToMinor(money: PayPalMoney): number {
  const exp = exponentOf(money.currency_code);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(money.value);
  if (!match) throw new Error(`Unexpected PayPal amount "${money.value}"`);
  const whole = match[1] ?? "0";
  const frac = match[2] ?? "";
  if (/[1-9]/.test(frac.slice(exp))) throw new Error(`Amount "${money.value}" has more than ${exp} decimals`);
  const minor = Number(whole + frac.slice(0, exp).padEnd(exp, "0"));
  if (!Number.isSafeInteger(minor)) throw new RangeError("amount too large");
  return minor;
}

// ---------------------------------------------------------------------------
// Errors: "rejected" (PayPal definitely did not act) vs "unknown" (it may have).
// ---------------------------------------------------------------------------
export type PayPalFailureKind = "rejected" | "retry_later" | "unknown";

export class PayPalError extends Error {
  constructor(
    readonly kind: PayPalFailureKind,
    readonly httpStatus: number | undefined,
    readonly errorName: string | undefined, // body.name
    readonly issues: string[], // body.details[].issue
    readonly debugId: string | undefined, // body.debug_id (safe to log)
    message: string,
  ) {
    super(message);
    this.name = "PayPalError";
  }
  get issue(): string | undefined {
    return this.issues[0];
  }
}

interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: { issue?: string; description?: string; field?: string }[];
}

function classify(method: string, status: number, issues: string[]): PayPalFailureKind {
  if (status === 409 || status === 429) return "retry_later"; // PREVIOUS_REQUEST_IN_PROGRESS / RATE_LIMIT_REACHED
  if (status >= 500) return method === "GET" ? "retry_later" : "unknown"; // 5xx on POST may have executed
  if (issues.includes("PREVIOUS_REQUEST_IN_PROGRESS")) return "retry_later";
  return "rejected"; // 400/401/403/404/422 ...
}

// ---------------------------------------------------------------------------
// OAuth 2.0 client credentials with in-memory caching.
// ---------------------------------------------------------------------------
let tokenCache: { value: string; expiresAt: number } | undefined;
let tokenInflight: Promise<string> | undefined;

export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (forceRefresh) tokenCache = undefined;
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.value;
  tokenInflight ??= (async () => {
    const basic = Buffer.from(`${requireEnv("PAYPAL_CLIENT_ID")}:${requireEnv("PAYPAL_CLIENT_SECRET")}`).toString("base64");
    let res: Response;
    try {
      res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new PayPalError("retry_later", undefined, undefined, [], undefined, "PayPal OAuth request failed (network)");
    }
    if (!res.ok) {
      // Identity errors are { error, error_description }; never log the Authorization header.
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new PayPalError("rejected", res.status, body.error, [], undefined, `PayPal OAuth failed: ${res.status} ${body.error ?? ""}`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    // Refresh 5 minutes early; expires_in is in seconds.
    tokenCache = { value: json.access_token, expiresAt: Date.now() + Math.max(0, json.expires_in - 300) * 1000 };
    return json.access_token;
  })().finally(() => {
    tokenInflight = undefined;
  });
  return tokenInflight;
}

// ---------------------------------------------------------------------------
// Core request helper.
// ---------------------------------------------------------------------------
interface CallOptions {
  body?: unknown; // serialised with JSON.stringify
  rawJson?: string; // pre-serialised JSON (webhook verification)
  requestId?: string; // PayPal-Request-Id (POST only)
  representation?: boolean; // Prefer: return=representation
  mockCode?: string; // PayPal-Mock-Response (sandbox negative testing; dev flag only)
  timeoutMs?: number;
}

async function call<T>(method: "GET" | "POST", path: string, opts: CallOptions = {}): Promise<{ status: number; data: T }> {
  if (opts.mockCode && !testFaultsEnabled()) {
    throw new Error("PayPal-Mock-Response is only allowed with test faults on");
  }
  const payload = opts.rawJson ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));

  const send = (token: string) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
    if (payload !== undefined) headers["Content-Type"] = "application/json";
    if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;
    if (opts.representation) headers["Prefer"] = "return=representation";
    if (opts.mockCode) headers["PayPal-Mock-Response"] = JSON.stringify({ mock_application_codes: opts.mockCode });
    return fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: payload,
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  };

  let res: Response;
  let text: string;
  try {
    res = await send(await getAccessToken());
    if (res.status === 401) {
      // Not authenticated => not processed. Refresh once and replay with the SAME request id.
      res = await send(await getAccessToken(true));
    }
    text = await res.text();
  } catch (cause) {
    if (cause instanceof PayPalError) throw cause; // token fetch problem: request never sent
    // Timeout / network error / truncated body: PayPal MAY have executed a POST.
    throw new PayPalError(
      method === "GET" ? "retry_later" : "unknown",
      undefined, undefined, [], undefined,
      `PayPal ${method} ${path} outcome unknown (${cause instanceof Error ? cause.name : "error"})`,
    );
  }

  if (res.ok) {
    try {
      return { status: res.status, data: (text ? JSON.parse(text) : {}) as T };
    } catch {
      throw new PayPalError(method === "GET" ? "retry_later" : "unknown", res.status, undefined, [], undefined, `PayPal ${method} ${path}: unparseable 2xx body`);
    }
  }

  let body: PayPalErrorBody = {};
  try {
    body = text ? (JSON.parse(text) as PayPalErrorBody) : {};
  } catch {
    /* non-JSON error page */
  }
  const issues = (body.details ?? []).map((d) => d.issue).filter((i): i is string => Boolean(i));
  const kind = classify(method, res.status, issues);
  throw new PayPalError(kind, res.status, body.name, issues, body.debug_id,
    `PayPal ${method} ${path} -> ${res.status} ${body.name ?? ""} ${issues.join(",")} debug_id=${body.debug_id ?? "n/a"}`);
}

// ---------------------------------------------------------------------------
// Response types (only the fields Settlix reads).
// ---------------------------------------------------------------------------
export type OrderStatus = "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
export type CaptureStatus = "COMPLETED" | "DECLINED" | "PARTIALLY_REFUNDED" | "PENDING" | "REFUNDED" | "FAILED";
export type RefundStatus = "CANCELLED" | "FAILED" | "PENDING" | "COMPLETED";

export interface PayPalCapture {
  id: string;
  status: CaptureStatus;
  status_details?: { reason?: string };
  amount: PayPalMoney;
  custom_id?: string;
  invoice_id?: string;
  seller_receivable_breakdown?: { gross_amount: PayPalMoney; paypal_fee?: PayPalMoney; net_amount?: PayPalMoney };
  supplementary_data?: { related_ids?: { order_id?: string } };
}

export interface PayPalRefund {
  id: string;
  status: RefundStatus;
  status_details?: { reason?: string };
  amount?: PayPalMoney;
  custom_id?: string;
  invoice_id?: string;
  seller_payable_breakdown?: { gross_amount?: PayPalMoney; total_refunded_amount?: PayPalMoney };
  links?: { href: string; rel: string; method?: string }[];
}

export interface PayPalOrder {
  id: string;
  status: OrderStatus;
  purchase_units?: {
    reference_id?: string;
    custom_id?: string;
    amount?: PayPalMoney;
    payments?: { captures?: PayPalCapture[]; refunds?: PayPalRefund[] };
  }[];
  links?: { href: string; rel: string; method?: string }[];
}

// ---------------------------------------------------------------------------
// Orders v2
// ---------------------------------------------------------------------------
export async function createOrder(input: {
  settlixOrderId: string; // -> reference_id + custom_id
  amountMinor: number; // from the DB, never from the browser
  currency: CurrencyCode;
  requestId: string; // persisted UUID for this order attempt
  description?: string;
}): Promise<PayPalOrder> {
  const { data } = await call<PayPalOrder>("POST", "/v2/checkout/orders", {
    requestId: input.requestId,
    representation: true,
    body: {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.settlixOrderId,
          custom_id: input.settlixOrderId,
          description: input.description?.slice(0, 127),
          amount: minorToPayPal(input.amountMinor, input.currency),
        },
      ],
    },
  });
  return data; // data.id is the PayPal ORDER id
}

export async function getOrder(orderId: string): Promise<PayPalOrder> {
  return (await call<PayPalOrder>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`)).data;
}

export async function captureOrder(orderId: string, requestId: string) {
  const { status, data } = await call<PayPalOrder>("POST", `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    requestId,
    representation: true,
    body: {},
  });
  const unit = data.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  return {
    httpStatus: status, // 201 new, 200 idempotent replay, 202 async (treat as pending)
    orderId: data.id,
    orderStatus: data.status, // COMPLETED does NOT mean paid
    captureId: capture?.id, // store this: refunds need it
    captureStatus: capture?.status, // only COMPLETED = paid
    captureReason: capture?.status_details?.reason,
    capturedAmount: capture?.amount,
    customId: unit?.custom_id,
    referenceId: unit?.reference_id,
  };
}

// ---------------------------------------------------------------------------
// Payments v2
// ---------------------------------------------------------------------------
export async function getCapture(captureId: string): Promise<PayPalCapture> {
  return (await call<PayPalCapture>("GET", `/v2/payments/captures/${encodeURIComponent(captureId)}`)).data;
}

export async function refundCapture(input: {
  captureId: string; // CAPTURE id, never an order id
  requestId: string; // persisted on the refund row BEFORE this call; reuse verbatim on retry
  amountMinor: number; // explicit amount, even for "full" refunds
  currency: CurrencyCode;
  settlixRefundId: string; // -> custom_id (keep to [A-Za-z0-9-_.,], max 127)
  noteToPayer?: string; // max 255, shown to buyer
  mockCode?: string; // sandbox negative testing only
}): Promise<{ httpStatus: number; refund: PayPalRefund }> {
  const { status, data } = await call<PayPalRefund>("POST", `/v2/payments/captures/${encodeURIComponent(input.captureId)}/refund`, {
    requestId: input.requestId,
    representation: true,
    mockCode: input.mockCode,
    body: {
      amount: minorToPayPal(input.amountMinor, input.currency),
      custom_id: input.settlixRefundId,
      note_to_payer: input.noteToPayer?.slice(0, 255),
    },
  });
  return { httpStatus: status, refund: data }; // only refund.status === "COMPLETED" counts as refunded
}

export async function getRefund(refundId: string): Promise<PayPalRefund> {
  return (await call<PayPalRefund>("GET", `/v2/payments/refunds/${encodeURIComponent(refundId)}`)).data;
}

// ---------------------------------------------------------------------------
// Webhooks: postback verification with the RAW body spliced in verbatim.
// ---------------------------------------------------------------------------
export async function verifyWebhookSignature(rawBody: string, headers: Headers): Promise<boolean> {
  const fields = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
    webhook_id: requireEnv("PAYPAL_WEBHOOK_ID"),
  };
  if (Object.values(fields).some((v) => !v)) return false;
  try {
    JSON.parse(rawBody); // must be a JSON object; we still send the ORIGINAL text below
  } catch {
    return false;
  }
  const head = JSON.stringify(fields); // '{"auth_algo":...,"webhook_id":"..."}'
  const rawJson = `${head.slice(0, -1)},"webhook_event":${rawBody}}`; // never re-serialise the event
  const { data } = await call<{ verification_status: "SUCCESS" | "FAILURE" }>(
    "POST",
    "/v1/notifications/verify-webhook-signature",
    { rawJson },
  );
  return data.verification_status === "SUCCESS";
}
```

## Usage: refund service (persist first, then call)

`Db` and `RefundRow` stand for Settlix's own persistence layer and are illustrative, not
type-checked.

```ts
import { randomUUID } from "node:crypto";
import { refundCapture, getRefund, PayPalError } from "@/server/paypal";

export async function requestRefund(db: Db, input: { settlixOrderId: string; amountMinor: number; reason?: string }) {
  // 1) Validate against OUR ledger: captured - already refunded (COMPLETED + PENDING + RECOVERY_REQUIRED).
  const order = await db.orders.get(input.settlixOrderId);               // has paypal_capture_id, currency
  const remaining = await db.refunds.remainingRefundableMinor(order.id);
  if (input.amountMinor <= 0 || input.amountMinor > remaining) throw new Error("invalid refund amount");

  // 2) Persist intent + idempotency key BEFORE any network call (commit!).
  const refund = await db.refunds.insert({
    id: `rfd_${randomUUID()}`, orderId: order.id, captureId: order.paypalCaptureId,
    amountMinor: input.amountMinor, currency: order.currency,
    paypalRequestId: randomUUID(), state: "REQUESTED",
  });

  // 3) Call PayPal with the stored key.
  return executeRefund(db, refund);
}

// Also used by the reconciliation job for RECOVERY_REQUIRED rows: same key, same body.
export async function executeRefund(db: Db, refund: RefundRow) {
  try {
    const { refund: pp } = await refundCapture({
      captureId: refund.captureId, requestId: refund.paypalRequestId,
      amountMinor: refund.amountMinor, currency: refund.currency, settlixRefundId: refund.id,
    });
    const state = pp.status === "COMPLETED" ? "REFUNDED" : pp.status === "PENDING" ? "PENDING" : "FAILED";
    return db.refunds.update(refund.id, { state, paypalRefundId: pp.id, paypalStatus: pp.status });
  } catch (e) {
    if (e instanceof PayPalError && e.kind === "rejected") {
      return db.refunds.update(refund.id, { state: "FAILED", paypalIssue: e.issue, paypalDebugId: e.debugId });
    }
    // unknown / retry_later / anything unexpected: NEVER create a new key; reconcile later.
    return db.refunds.update(refund.id, {
      state: "RECOVERY_REQUIRED",
      paypalDebugId: e instanceof PayPalError ? e.debugId : undefined,
    });
  }
}
```

Notes:
- Count `RECOVERY_REQUIRED` and `PENDING` refunds against the refundable remainder. That stops a
  second refund being requested while the first one's outcome is unknown.
- Use a DB uniqueness constraint on `paypal_request_id`, and serialize refunds per capture (a row
  lock or advisory lock) so two admins cannot race.
- Map the capture route the same way. Generate and persist the capture `PayPal-Request-Id` when the
  PayPal order is created. On success, verify `captureStatus === "COMPLETED"`, that
  `payPalToMinor(capturedAmount)` equals the DB amount and the currency matches, and that
  `referenceId`/`customId` equals the Settlix order ID. Only then mark the order paid.
