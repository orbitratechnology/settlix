import "server-only"

import { testFaultsEnabled } from "@/lib/testing/faults"

import { classifyFailure, PayPalError } from "./errors"

/** Settlix is sandbox-only; any other base URL is refused. */
export const PAYPAL_SANDBOX_BASE_URL = "https://api-m.sandbox.paypal.com"

export function paypalBaseUrl(): string {
  const url = process.env.PAYPAL_BASE_URL || PAYPAL_SANDBOX_BASE_URL
  if (url !== PAYPAL_SANDBOX_BASE_URL) {
    throw new Error(
      "Settlix is sandbox-only: refusing a non-sandbox PAYPAL_BASE_URL",
    )
  }
  return url
}

function credentials() {
  const clientId = process.env.PAYPAL_CLIENT_ID
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set")
  }
  return { clientId, clientSecret }
}

/** The REST app's client ID. Public by design: PayPal's JS SDK uses it in the browser. */
export function paypalClientId(): string | null {
  return process.env.PAYPAL_CLIENT_ID ?? null
}

// ---------------------------------------------------------------------------
// OAuth 2.0 client credentials, cached in memory until shortly before expiry.
// ---------------------------------------------------------------------------

type TokenInfo = { value: string; appId: string | null; expiresAt: number }

let tokenCache: TokenInfo | undefined
let tokenInflight: Promise<TokenInfo> | undefined

export function resetPayPalTokenCache() {
  tokenCache = undefined
  tokenInflight = undefined
}

async function fetchToken(): Promise<TokenInfo> {
  const baseUrl = paypalBaseUrl()
  const { clientId, clientSecret } = credentials()
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
  let response: Response
  try {
    response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new PayPalError(
      "retry_later",
      undefined,
      undefined,
      [],
      undefined,
      "PayPal OAuth request failed (network)",
    )
  }
  if (!response.ok) {
    // Identity errors are { error, error_description }. Never log the Authorization header.
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new PayPalError(
      response.status >= 500 ? "retry_later" : "rejected",
      response.status,
      body.error,
      [],
      undefined,
      `PayPal OAuth failed: ${response.status} ${body.error ?? ""}`.trim(),
    )
  }
  const json = (await response.json()) as {
    access_token: string
    expires_in: number
    app_id?: string
  }
  return {
    value: json.access_token,
    appId: json.app_id ?? null,
    // Refresh five minutes early; expires_in is in seconds.
    expiresAt: Date.now() + Math.max(0, json.expires_in - 300) * 1000,
  }
}

async function getToken(forceRefresh = false): Promise<TokenInfo> {
  if (forceRefresh) tokenCache = undefined
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache
  tokenInflight ??= fetchToken()
    .then((token) => {
      tokenCache = token
      return token
    })
    .finally(() => {
      tokenInflight = undefined
    })
  return tokenInflight
}

/** Confirms the sandbox credentials work. Returns only non-sensitive metadata. */
export async function checkPayPalConnection(): Promise<
  { ok: true; appId: string | null } | { ok: false; reason: string }
> {
  try {
    const token = await getToken()
    return { ok: true, appId: token.appId }
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof PayPalError && error.httpStatus === 401
          ? "PayPal rejected the sandbox credentials."
          : "PayPal could not be reached.",
    }
  }
}

// ---------------------------------------------------------------------------
// Core request helper.
// ---------------------------------------------------------------------------

export type CallOptions = {
  body?: unknown
  /** PayPal-Request-Id (idempotency key), POST only. */
  requestId?: string
  /** Prefer: return=representation */
  representation?: boolean
  timeoutMs?: number
  /**
   * Sandbox negative-testing code sent as PayPal-Mock-Response. Test faults
   * only (SETTLIX_TEST_FAULTS=1 outside production); refused otherwise.
   */
  mockCode?: string
}

export async function paypalRequest<T>(
  method: "GET" | "POST",
  path: string,
  options: CallOptions = {},
): Promise<{ status: number; data: T }> {
  // Checked before any network call so a misconfiguration is never mistaken for an outage.
  const baseUrl = paypalBaseUrl()
  if (options.mockCode && !testFaultsEnabled()) {
    throw new Error("PayPal-Mock-Response is only allowed with test faults on")
  }
  const payload =
    options.body === undefined ? undefined : JSON.stringify(options.body)

  const send = (token: string) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    }
    if (payload !== undefined) headers["Content-Type"] = "application/json"
    if (options.requestId) headers["PayPal-Request-Id"] = options.requestId
    if (options.representation) headers.Prefer = "return=representation"
    if (options.mockCode) {
      headers["PayPal-Mock-Response"] = JSON.stringify({
        mock_application_codes: options.mockCode,
      })
    }
    return fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: payload,
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    })
  }

  let response: Response
  let text: string
  try {
    response = await send((await getToken()).value)
    if (response.status === 401) {
      // Not authenticated means not processed: refresh once, replay with the SAME request ID.
      response = await send((await getToken(true)).value)
    }
    text = await response.text()
  } catch (cause) {
    if (cause instanceof PayPalError) throw cause // token problem: request never sent
    throw new PayPalError(
      method === "GET" ? "retry_later" : "unknown",
      undefined,
      undefined,
      [],
      undefined,
      `PayPal ${method} ${path} outcome unknown (${cause instanceof Error ? cause.name : "error"})`,
    )
  }

  if (response.ok) {
    try {
      return {
        status: response.status,
        data: (text ? JSON.parse(text) : {}) as T,
      }
    } catch {
      throw new PayPalError(
        method === "GET" ? "retry_later" : "unknown",
        response.status,
        undefined,
        [],
        undefined,
        `PayPal ${method} ${path}: unparseable 2xx body`,
      )
    }
  }

  let body: {
    name?: string
    debug_id?: string
    details?: { issue?: string }[]
  } = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    // Non-JSON error page.
  }
  const issues = (body.details ?? [])
    .map((detail) => detail.issue)
    .filter((issue): issue is string => Boolean(issue))
  throw new PayPalError(
    classifyFailure(method, response.status, issues),
    response.status,
    body.name,
    issues,
    body.debug_id,
    `PayPal ${method} ${path} → ${response.status} ${body.name ?? ""} ${issues.join(",")} debug_id=${body.debug_id ?? "n/a"}`,
  )
}
