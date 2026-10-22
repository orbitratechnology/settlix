import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"

import { recordAuditEvent } from "@/lib/audit/events"
import { gmailConfig } from "@/lib/env/server"
import { refreshContext } from "@/lib/gmail/client"
import {
  callbackUrl,
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  openOAuthState,
} from "@/lib/gmail/connect"
import { encryptSecret } from "@/lib/gmail/crypto"
import {
  exchangeCode,
  GoogleOAuthError,
  grantedPermissions,
  identityFromIdToken,
  revokeToken,
} from "@/lib/gmail/oauth"
import { can, getViewer } from "@/lib/security/auth"
import { siteOrigin } from "@/lib/site"
import { createAdminClient } from "@/lib/supabase/admin"

const permissionWords = (send: boolean, read: boolean) =>
  [send ? "send replies" : null, read ? "bring in refund emails" : null]
    .filter(Boolean)
    .join(" and ")

/**
 * Google sends the merchant back here after the consent screen. The sealed
 * cookie must match the returned state and the signed-in member who started
 * the flow; only then is the code exchanged (with the PKCE verifier) and the
 * tokens stored encrypted. Every outcome lands back on the Request form page.
 */
export async function GET(request: NextRequest) {
  const origin = await siteOrigin()
  const back = (result: string) => {
    const response = NextResponse.redirect(
      new URL(`/request-form?gmail=${result}#gmail`, origin),
    )
    response.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 })
    return response
  }

  const config = gmailConfig()
  if (!config) return back("not_configured")

  const params = request.nextUrl.searchParams
  const jar = await cookies()
  const saved = openOAuthState(
    jar.get(OAUTH_COOKIE)?.value,
    params.get("state"),
  )
  if (!saved) return back("expired")
  if (params.get("error")) {
    return back(params.get("error") === "access_denied" ? "denied" : "failed")
  }
  const code = params.get("code")
  if (!code) return back("failed")

  const viewer = await getViewer()
  if (
    viewer.status !== "member" ||
    viewer.userId !== saved.userId ||
    viewer.workspace.id !== saved.merchantId ||
    !can.manageStore(viewer.role) ||
    viewer.workspace.isDemo
  ) {
    return back("forbidden")
  }

  try {
    const tokens = await exchangeCode({
      client: { ...config, redirectUri: callbackUrl(origin) },
      code,
      codeVerifier: saved.verifier,
    })
    const granted = grantedPermissions(tokens.scope)
    if (!granted.send && !granted.read) {
      // The merchant unticked every Gmail permission on Google's screen.
      await revokeToken(tokens.refreshToken ?? tokens.accessToken)
      return back("no_permission")
    }
    const identity = identityFromIdToken(tokens.idToken, config.clientId)
    if (!tokens.refreshToken) return back("failed")

    const admin = createAdminClient()
    const merchantId = saved.merchantId
    const { data: previous } = await admin
      .from("gmail_connections")
      .select("google_subject, last_synced_at")
      .eq("merchant_id", merchantId)
      .maybeSingle()
    const sameAccount = previous?.google_subject === identity.sub

    const { error } = await admin.from("gmail_connections").upsert(
      {
        merchant_id: merchantId,
        google_email: identity.email,
        google_subject: identity.sub,
        scopes: granted.scopes,
        refresh_token_ciphertext: encryptSecret(
          tokens.refreshToken,
          refreshContext(merchantId),
          config.encryptionKey,
        ),
        access_token_ciphertext: encryptSecret(
          tokens.accessToken,
          `gmail-access:${merchantId}`,
          config.encryptionKey,
        ),
        access_token_expires_at: new Date(
          Date.now() + tokens.expiresIn * 1000,
        ).toISOString(),
        status: "active",
        last_error: null,
        // A different account starts its own history.
        last_synced_at: sameAccount ? (previous?.last_synced_at ?? null) : null,
        sync_started_at: null,
        connected_by: viewer.userId,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "merchant_id" },
    )
    if (error) throw new Error("Could not save the connection", { cause: error })

    await recordAuditEvent(admin, {
      merchantId,
      actor: { type: "user", id: viewer.userId },
      eventType: "gmail.connected",
      summary: `Gmail (${identity.email}) connected: Settlix may ${permissionWords(granted.send, granted.read)}.`,
      metadata: { send: granted.send, read: granted.read },
    })
    return back(
      granted.send && granted.read ? "connected" : granted.send ? "connected_send" : "connected_read",
    )
  } catch (caught) {
    if (caught instanceof GoogleOAuthError) {
      console.error("Gmail connection failed", { code: caught.code })
      return back("failed")
    }
    throw caught
  }
}
