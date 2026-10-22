import { createHash, randomBytes } from "node:crypto"

/**
 * Google OAuth 2.0 for web server apps, with PKCE. Only the endpoints and
 * fields Settlix uses. Every function takes `fetchImpl` so tests never reach
 * Google.
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"

/** Gmail permissions, smallest first. "send" is a sensitive scope, "read" a restricted one. */
export const GMAIL_SCOPES = {
  send: "https://www.googleapis.com/auth/gmail.send",
  read: "https://www.googleapis.com/auth/gmail.readonly",
} as const

export type GmailPermission = keyof typeof GMAIL_SCOPES

const IDENTITY_SCOPES = ["openid", "email"]

export type OAuthClient = {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function newPkce() {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  return { verifier, challenge }
}

export function newState() {
  return randomBytes(24).toString("base64url")
}

/**
 * The consent URL. `prompt=consent` makes Google return a refresh token every
 * time (it only does on consent); `login_hint` skips the account chooser when
 * reconnecting; `include_granted_scopes` keeps earlier grants.
 */
export function authorizationUrl(input: {
  client: Pick<OAuthClient, "clientId" | "redirectUri">
  permissions: GmailPermission[]
  state: string
  codeChallenge: string
  loginHint?: string | null
}): string {
  const url = new URL(GOOGLE_AUTH_URL)
  const scopes = [
    ...IDENTITY_SCOPES,
    ...input.permissions.map((permission) => GMAIL_SCOPES[permission]),
  ]
  url.search = new URLSearchParams({
    client_id: input.client.clientId,
    redirect_uri: input.client.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    ...(input.loginHint ? { login_hint: input.loginHint } : {}),
  }).toString()
  return url.toString()
}

/** Which Gmail features a granted scope list allows (users may untick some). */
export function grantedPermissions(scope: string | undefined) {
  const granted = new Set((scope ?? "").split(/\s+/).filter(Boolean))
  return {
    send: granted.has(GMAIL_SCOPES.send),
    read: granted.has(GMAIL_SCOPES.read),
    scopes: [...granted].sort(),
  }
}

export class GoogleOAuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "GoogleOAuthError"
  }

  /** The grant is gone (revoked, expired, password changed): reconnect. */
  get needsReconnect() {
    return this.code === "invalid_grant" || this.code === "unauthorized_client"
  }
}

type TokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  id_token?: string
  token_type?: string
  error?: string
  error_description?: string
}

async function tokenRequest(
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<TokenResponse> {
  let response: Response
  try {
    response = await fetchImpl(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new GoogleOAuthError("network", "Google could not be reached.")
  }
  const data = (await response.json().catch(() => ({}))) as TokenResponse
  if (!response.ok || data.error) {
    throw new GoogleOAuthError(
      data.error ?? "http_error",
      // Google's descriptions never contain tokens; keep them short anyway.
      (data.error_description ?? `Google answered ${response.status}`).slice(
        0,
        200,
      ),
      response.status,
    )
  }
  return data
}

export type ExchangedTokens = {
  accessToken: string
  expiresIn: number
  refreshToken: string | null
  scope: string
  idToken: string | null
}

export async function exchangeCode(
  input: { client: OAuthClient; code: string; codeVerifier: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ExchangedTokens> {
  const data = await tokenRequest(
    {
      client_id: input.client.clientId,
      client_secret: input.client.clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: input.client.redirectUri,
    },
    fetchImpl,
  )
  if (!data.access_token) {
    throw new GoogleOAuthError("invalid_response", "Google sent no token.")
  }
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
    refreshToken: data.refresh_token ?? null,
    scope: data.scope ?? "",
    idToken: data.id_token ?? null,
  }
}

export async function refreshAccessToken(
  input: { client: Omit<OAuthClient, "redirectUri">; refreshToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; expiresIn: number }> {
  const data = await tokenRequest(
    {
      client_id: input.client.clientId,
      client_secret: input.client.clientSecret,
      grant_type: "refresh_token",
      refresh_token: input.refreshToken,
    },
    fetchImpl,
  )
  if (!data.access_token) {
    throw new GoogleOAuthError("invalid_response", "Google sent no token.")
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 }
}

/** Best effort: a token that is already invalid counts as revoked. */
export async function revokeToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl(GOOGLE_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
      signal: AbortSignal.timeout(10_000),
    })
    return response.ok || response.status === 400
  } catch {
    return false
  }
}

export type GoogleIdentity = { sub: string; email: string }

/**
 * Reads the ID token that came straight from Google's token endpoint over TLS
 * (OpenID Connect Core §3.1.3.7 lets a client rely on TLS instead of the
 * signature there). Still checks issuer, audience, expiry and email_verified.
 */
export function identityFromIdToken(
  idToken: string | null,
  clientId: string,
  now = Date.now(),
): GoogleIdentity {
  const payload = idToken?.split(".")[1]
  if (!payload) throw new GoogleOAuthError("invalid_id_token", "No ID token.")
  let claims: Record<string, unknown>
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    throw new GoogleOAuthError("invalid_id_token", "Unreadable ID token.")
  }
  const issuerOk =
    claims.iss === "https://accounts.google.com" ||
    claims.iss === "accounts.google.com"
  const audienceOk = Array.isArray(claims.aud)
    ? claims.aud.includes(clientId)
    : claims.aud === clientId
  const fresh = typeof claims.exp === "number" && claims.exp * 1000 > now - 60_000
  if (!issuerOk || !audienceOk || !fresh) {
    throw new GoogleOAuthError("invalid_id_token", "ID token rejected.")
  }
  if (
    typeof claims.sub !== "string" ||
    typeof claims.email !== "string" ||
    (claims.email_verified !== true && claims.email_verified !== "true")
  ) {
    throw new GoogleOAuthError(
      "invalid_id_token",
      "Google didn't confirm the email address.",
    )
  }
  return { sub: claims.sub, email: claims.email.toLowerCase() }
}
