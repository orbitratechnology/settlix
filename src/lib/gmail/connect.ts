import "server-only"

import { timingSafeEqual } from "node:crypto"

import { gmailConfig } from "@/lib/env/server"
import { decryptSecret, encryptSecret } from "@/lib/gmail/crypto"
import type { GmailPermission } from "@/lib/gmail/oauth"

/** Short-lived cookie that carries the OAuth state and PKCE verifier. */
export const OAUTH_COOKIE = "settlix_gmail_oauth"
export const OAUTH_COOKIE_PATH = "/api/integrations/gmail"
export const OAUTH_TTL_SECONDS = 10 * 60
const CONTEXT = "gmail-oauth-state"

export type OAuthState = {
  state: string
  verifier: string
  merchantId: string
  userId: string
  permissions: GmailPermission[]
  createdAt: number
}

export function callbackUrl(origin: string) {
  return `${origin}/api/integrations/gmail/callback`
}

/** Sealed with the server key, so the browser can neither read nor forge it. */
export function sealOAuthState(value: OAuthState): string {
  const config = gmailConfig()
  if (!config) throw new Error("Gmail is not configured")
  return encryptSecret(JSON.stringify(value), CONTEXT, config.encryptionKey)
}

export function openOAuthState(
  sealed: string | undefined,
  returnedState: string | null,
): OAuthState | null {
  const config = gmailConfig()
  if (!sealed || !returnedState || !config) return null
  let value: OAuthState
  try {
    value = JSON.parse(decryptSecret(sealed, CONTEXT, config.encryptionKey))
  } catch {
    return null
  }
  if (Date.now() - value.createdAt > OAUTH_TTL_SECONDS * 1000) return null
  const expected = Buffer.from(value.state)
  const actual = Buffer.from(returnedState)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null
  }
  return value
}
