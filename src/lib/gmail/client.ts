import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { gmailConfig } from "@/lib/env/server"
import { decryptSecret, encryptSecret } from "@/lib/gmail/crypto"
import { buildRawEmail, type OutgoingEmail } from "@/lib/gmail/mime"
import {
  GoogleOAuthError,
  grantedPermissions,
  refreshAccessToken,
} from "@/lib/gmail/oauth"
import type { GmailMessage } from "@/lib/gmail/parse"
import type { Database, Tables } from "@/types/database"

type Db = SupabaseClient<Database>
type ConnectionRow = Tables<"gmail_connections">

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"

export const refreshContext = (merchantId: string) =>
  `gmail-refresh:${merchantId}`
const accessContext = (merchantId: string) => `gmail-access:${merchantId}`

/** What members may see about the connection; never a token. */
export type GmailConnectionView = {
  email: string
  canSend: boolean
  canRead: boolean
  status: ConnectionRow["status"]
  lastSyncedAt: string | null
  lastError: string | null
  connectedAt: string
}

const VIEW_COLUMNS =
  "google_email, scopes, status, last_synced_at, last_error, connected_at" as const

export async function getGmailConnection(
  admin: Db,
  merchantId: string,
): Promise<GmailConnectionView | null> {
  const { data, error } = await admin
    .from("gmail_connections")
    .select(VIEW_COLUMNS)
    .eq("merchant_id", merchantId)
    .maybeSingle()
  if (error)
    throw new Error("Could not load the Gmail connection", { cause: error })
  if (!data) return null
  const permissions = grantedPermissions(data.scopes.join(" "))
  return {
    email: data.google_email,
    canSend: permissions.send,
    canRead: permissions.read,
    status: data.status,
    lastSyncedAt: data.last_synced_at,
    lastError: data.last_error,
    connectedAt: data.connected_at,
  }
}

export type GmailErrorKind =
  | "not_configured"
  | "not_connected"
  | "needs_reconnect"
  | "missing_permission"
  | "unavailable"

export class GmailError extends Error {
  constructor(
    readonly kind: GmailErrorKind,
    message: string,
  ) {
    super(message)
    this.name = "GmailError"
  }
}

const messages: Record<GmailErrorKind, string> = {
  not_configured: "Gmail isn't set up on this server.",
  not_connected: "Connect Gmail first.",
  needs_reconnect:
    "Google ended Settlix's access to this Gmail. Reconnect it to continue.",
  missing_permission:
    "This Gmail connection doesn't allow that. Reconnect it and tick the permission.",
  unavailable: "Gmail didn't respond. Try again in a minute.",
}

function gmailError(kind: GmailErrorKind) {
  return new GmailError(kind, messages[kind])
}

async function markNeedsReconnect(admin: Db, merchantId: string) {
  await admin
    .from("gmail_connections")
    .update({
      status: "needs_reconnect",
      access_token_ciphertext: null,
      access_token_expires_at: null,
      last_error: messages.needs_reconnect,
    })
    .eq("merchant_id", merchantId)
}

/**
 * A valid access token for the merchant's Gmail: the cached one while it has
 * more than a minute left, otherwise a fresh one from the refresh token. A
 * refused refresh token (revoked, or Google's 7-day limit for apps in testing)
 * marks the connection for a one-click reconnect.
 */
export async function gmailAccessToken(
  admin: Db,
  merchantId: string,
  need: "send" | "read",
  fetchImpl: typeof fetch = fetch,
): Promise<{ token: string; connection: ConnectionRow }> {
  const config = gmailConfig()
  if (!config) throw gmailError("not_configured")
  const { data: row, error } = await admin
    .from("gmail_connections")
    .select("*")
    .eq("merchant_id", merchantId)
    .maybeSingle()
  if (error)
    throw new Error("Could not load the Gmail connection", { cause: error })
  if (!row) throw gmailError("not_connected")
  if (row.status === "needs_reconnect") throw gmailError("needs_reconnect")
  if (!grantedPermissions(row.scopes.join(" "))[need]) {
    throw gmailError("missing_permission")
  }

  if (
    row.access_token_ciphertext &&
    row.access_token_expires_at &&
    Date.parse(row.access_token_expires_at) > Date.now() + 60_000
  ) {
    try {
      return {
        token: decryptSecret(
          row.access_token_ciphertext,
          accessContext(merchantId),
          config.encryptionKey,
        ),
        connection: row,
      }
    } catch {
      // Unreadable cache (e.g. a rotated key): fall through to a refresh.
    }
  }

  let refreshToken: string
  try {
    refreshToken = decryptSecret(
      row.refresh_token_ciphertext,
      refreshContext(merchantId),
      config.encryptionKey,
    )
  } catch {
    await markNeedsReconnect(admin, merchantId)
    throw gmailError("needs_reconnect")
  }

  try {
    const fresh = await refreshAccessToken(
      { client: config, refreshToken },
      fetchImpl,
    )
    await admin
      .from("gmail_connections")
      .update({
        access_token_ciphertext: encryptSecret(
          fresh.accessToken,
          accessContext(merchantId),
          config.encryptionKey,
        ),
        access_token_expires_at: new Date(
          Date.now() + fresh.expiresIn * 1000,
        ).toISOString(),
      })
      .eq("merchant_id", merchantId)
    return { token: fresh.accessToken, connection: row }
  } catch (caught) {
    if (caught instanceof GoogleOAuthError && caught.needsReconnect) {
      await markNeedsReconnect(admin, merchantId)
      throw gmailError("needs_reconnect")
    }
    throw gmailError("unavailable")
  }
}

async function gmailRequest<T>(
  token: string,
  path: string,
  init: {
    method?: string
    body?: unknown
    query?: Record<string, string | string[]>
  } = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const url = new URL(`${GMAIL_API}${path}`)
  for (const [key, value] of Object.entries(init.query ?? {})) {
    for (const item of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, item)
    }
  }
  let response: Response
  try {
    response = await fetchImpl(url, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw gmailError("unavailable")
  }
  if (response.status === 401) throw gmailError("needs_reconnect")
  if (response.status === 403) throw gmailError("missing_permission")
  if (!response.ok) throw gmailError("unavailable")
  return (await response.json()) as T
}

/**
 * Sends a plain-text email from the merchant's Gmail. With `threadId` it lands
 * in that conversation; Gmail fills in From with the connected address.
 */
export async function sendFromGmail(
  admin: Db,
  merchantId: string,
  email: OutgoingEmail & { threadId?: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<{ messageId: string; threadId: string; from: string }> {
  const { token, connection } = await gmailAccessToken(
    admin,
    merchantId,
    "send",
    fetchImpl,
  )
  const sent = await gmailRequest<{ id: string; threadId: string }>(
    token,
    "/messages/send",
    {
      method: "POST",
      body: {
        raw: buildRawEmail(email),
        ...(email.threadId ? { threadId: email.threadId } : {}),
      },
    },
    fetchImpl,
  )
  return {
    messageId: sent.id,
    threadId: sent.threadId,
    from: connection.google_email,
  }
}

export async function listGmailMessageIds(
  token: string,
  query: string,
  maxResults: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; threadId: string }[]> {
  const result = await gmailRequest<{
    messages?: { id: string; threadId: string }[]
  }>(
    token,
    "/messages",
    { query: { q: query, maxResults: String(maxResults) } },
    fetchImpl,
  )
  return result.messages ?? []
}

export function getGmailMessage(
  token: string,
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GmailMessage> {
  return gmailRequest<GmailMessage>(
    token,
    `/messages/${encodeURIComponent(id)}`,
    { query: { format: "full" } },
    fetchImpl,
  )
}
