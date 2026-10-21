import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { paypalRequest, resetPayPalTokenCache } from "./client"
import { classifyFailure, PayPalError } from "./errors"
import { capturePayPalOrder, createPayPalOrder } from "./orders"
import { refundPayPalCapture } from "./payments"

type Call = { url: string; init: RequestInit }

const realFetch = globalThis.fetch
const savedEnv = { ...process.env }
let calls: Call[] = []
let responders: ((call: Call) => Response | Promise<Response>)[] = []

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

const tokenResponse = () =>
  json(200, { access_token: "test-token", expires_in: 32400, app_id: "APP-1" })

function headersOf(call: Call) {
  return new Headers(call.init.headers)
}

beforeEach(() => {
  process.env.PAYPAL_CLIENT_ID = "client-id"
  process.env.PAYPAL_CLIENT_SECRET = "client-secret"
  delete process.env.PAYPAL_BASE_URL
  resetPayPalTokenCache()
  calls = []
  responders = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init: init ?? {} }
    calls.push(call)
    const responder = responders.shift()
    if (!responder) throw new Error(`Unexpected fetch ${call.url}`)
    return responder(call)
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = realFetch
  process.env = { ...savedEnv }
})

describe("sandbox enforcement", () => {
  test("refuses a non-sandbox base URL before any network call", async () => {
    process.env.PAYPAL_BASE_URL = "https://api-m.paypal.com"
    await expect(paypalRequest("GET", "/v2/checkout/orders/X")).rejects.toThrow(
      /sandbox-only/,
    )
    expect(calls).toHaveLength(0)
  })
})

describe("OAuth token", () => {
  test("is fetched once and reused across requests", async () => {
    responders.push(
      tokenResponse,
      () => json(200, { id: "A" }),
      () => json(200, { id: "B" }),
    )
    await paypalRequest("GET", "/v2/checkout/orders/A")
    await paypalRequest("GET", "/v2/checkout/orders/B")
    const tokenCalls = calls.filter((call) =>
      call.url.endsWith("/v1/oauth2/token"),
    )
    expect(tokenCalls).toHaveLength(1)
    expect(headersOf(tokenCalls[0]!).get("Authorization")).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
    )
    expect(headersOf(calls[1]!).get("Authorization")).toBe("Bearer test-token")
  })

  test("a 401 refreshes the token once and replays with the same request ID", async () => {
    responders.push(
      tokenResponse,
      () => json(401, { name: "AUTHENTICATION_FAILURE" }),
      tokenResponse,
      () => json(201, { id: "R1", status: "COMPLETED" }),
    )
    await refundPayPalCapture({
      captureId: "CAPTURE123",
      requestId: "req-1",
      amountMinor: 500,
      currency: "USD",
      settlixRefundId: "refund-1",
    })
    const apiCalls = calls.filter((call) => call.url.includes("/refund"))
    expect(apiCalls).toHaveLength(2)
    expect(
      apiCalls.map((call) => headersOf(call).get("PayPal-Request-Id")),
    ).toEqual(["req-1", "req-1"])
  })
})

describe("request formatting", () => {
  test("create order sends the server amount, Settlix IDs, and idempotency headers", async () => {
    responders.push(tokenResponse, () =>
      json(201, { id: "ORDER1", status: "CREATED" }),
    )
    const order = await createPayPalOrder({
      settlixOrderId: "settlix-order-1",
      amountMinor: 8900,
      currency: "USD",
      requestId: "create-req",
      description: "Stoneware pour-over coffee set",
    })
    expect(order.id).toBe("ORDER1")
    const call = calls[1]!
    expect(call.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders")
    expect(call.init.method).toBe("POST")
    const headers = headersOf(call)
    expect(headers.get("PayPal-Request-Id")).toBe("create-req")
    expect(headers.get("Prefer")).toBe("return=representation")
    const body = JSON.parse(String(call.init.body))
    expect(body.intent).toBe("CAPTURE")
    expect(body.purchase_units[0]).toMatchObject({
      reference_id: "settlix-order-1",
      custom_id: "settlix-order-1",
      amount: { currency_code: "USD", value: "89.00" },
    })
  })

  test("capture reads the capture ID from purchase_units, not the order ID", async () => {
    responders.push(tokenResponse, () =>
      json(201, {
        id: "ORDER1",
        status: "COMPLETED",
        purchase_units: [
          {
            reference_id: "settlix-order-1",
            payments: {
              captures: [
                {
                  id: "CAPTURE1",
                  status: "COMPLETED",
                  amount: { currency_code: "USD", value: "89.00" },
                  custom_id: "settlix-order-1",
                },
              ],
            },
          },
        ],
      }),
    )
    const result = await capturePayPalOrder("ORDER1", "capture-req")
    expect(result.orderId).toBe("ORDER1")
    expect(result.capture?.id).toBe("CAPTURE1")
    expect(result.capture?.id).not.toBe(result.orderId)
    expect(calls[1]!.url).toEndWith("/v2/checkout/orders/ORDER1/capture")
    expect(headersOf(calls[1]!).get("PayPal-Request-Id")).toBe("capture-req")
  })

  test("refund always sends an explicit amount and the Settlix refund ID", async () => {
    responders.push(tokenResponse, () =>
      json(201, { id: "REFUND1", status: "COMPLETED" }),
    )
    const { refund } = await refundPayPalCapture({
      captureId: "CAPTURE1",
      requestId: "refund-req",
      amountMinor: 2500,
      currency: "USD",
      settlixRefundId: "settlix-refund-1",
    })
    expect(refund.status).toBe("COMPLETED")
    expect(calls[1]!.url).toEndWith("/v2/payments/captures/CAPTURE1/refund")
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({
      amount: { currency_code: "USD", value: "25.00" },
      custom_id: "settlix-refund-1",
    })
  })
})

describe("error classification", () => {
  test("422 business errors are rejected with issues and debug_id", async () => {
    responders.push(tokenResponse, () =>
      json(422, {
        name: "UNPROCESSABLE_ENTITY",
        debug_id: "dbg123",
        details: [{ issue: "CAPTURE_FULLY_REFUNDED" }],
      }),
    )
    const error = await refundPayPalCapture({
      captureId: "CAPTURE1",
      requestId: "r",
      amountMinor: 100,
      currency: "USD",
      settlixRefundId: "s",
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(PayPalError)
    const paypalError = error as PayPalError
    expect(paypalError.kind).toBe("rejected")
    expect(paypalError.issue).toBe("CAPTURE_FULLY_REFUNDED")
    expect(paypalError.debugId).toBe("dbg123")
    expect(JSON.stringify(paypalError.toLogObject())).not.toContain(
      "test-token",
    )
  })

  test("a network failure on POST is an unknown outcome", async () => {
    responders.push(tokenResponse, () => {
      throw new TypeError("fetch failed")
    })
    const error = (await refundPayPalCapture({
      captureId: "CAPTURE1",
      requestId: "r",
      amountMinor: 100,
      currency: "USD",
      settlixRefundId: "s",
    }).catch((caught: unknown) => caught)) as PayPalError
    expect(error.kind).toBe("unknown")
  })

  test("a 5xx on POST is unknown; on GET it is retry_later", () => {
    expect(classifyFailure("POST", 500, [])).toBe("unknown")
    expect(classifyFailure("GET", 503, [])).toBe("retry_later")
  })

  test("409 and 429 are retry_later; 4xx are rejected", () => {
    expect(classifyFailure("POST", 409, ["PREVIOUS_REQUEST_IN_PROGRESS"])).toBe(
      "retry_later",
    )
    expect(classifyFailure("POST", 429, [])).toBe("retry_later")
    expect(classifyFailure("POST", 400, ["INVALID_PARAMETER_VALUE"])).toBe(
      "rejected",
    )
    expect(classifyFailure("POST", 404, ["INVALID_RESOURCE_ID"])).toBe(
      "rejected",
    )
  })

  test("an OAuth credential failure is rejected and sends no API request", async () => {
    responders.push(() => json(401, { error: "invalid_client" }))
    const error = (await paypalRequest("GET", "/v2/checkout/orders/A").catch(
      (caught: unknown) => caught,
    )) as PayPalError
    expect(error.kind).toBe("rejected")
    expect(calls).toHaveLength(1)
  })
})
