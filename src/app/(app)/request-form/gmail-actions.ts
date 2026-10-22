"use server"

import { refresh } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { after } from "next/server"

import { recordAuditEvent } from "@/lib/audit/events"
import { gmailConfig } from "@/lib/env/server"
import { getGmailConnection, refreshContext } from "@/lib/gmail/client"
import {
  callbackUrl,
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  OAUTH_TTL_SECONDS,
  sealOAuthState,
} from "@/lib/gmail/connect"
import { decryptSecret } from "@/lib/gmail/crypto"
import {
  authorizationUrl,
  newPkce,
  newState,
  revokeToken,
  type GmailPermission,
} from "@/lib/gmail/oauth"
import { syncGmail, type SyncResult } from "@/lib/gmail/sync"
import { acknowledgeRequest } from "@/lib/intake/outbound"
import { autoCheckRequest } from "@/lib/intake/service"
import { can, requireMember, type Member } from "@/lib/security/auth"
import { consumeRateLimit } from "@/lib/security/rate-limit"
import { siteOrigin } from "@/lib/site"
import { createAdminClient } from "@/lib/supabase/admin"

export type GmailActionState = { error?: string }

function connectBlocked(member: Member): string | null {
  if (!can.manageStore(member.role)) {
    return "Only owners and admins can connect Gmail."
  }
  if (member.workspace.isDemo) {
    return "Gmail can't be connected to the shared demo store: everyone signed in to it would see the mailbox."
  }
  if (!gmailConfig()) return "Gmail isn't set up on this server yet."
  return null
}

/**
 * Starts "Connect Gmail": one Google consent screen asking only for what the
 * merchant ticked. The state and PKCE verifier travel in a sealed, short-lived,
 * httpOnly cookie; the callback checks both.
 */
export async function startGmailConnect(
  _previous: GmailActionState,
  formData: FormData,
): Promise<GmailActionState> {
  const member = await requireMember()
  const blocked = connectBlocked(member)
  if (blocked) return { error: blocked }
  const config = gmailConfig()!

  const permissions = (["send", "read"] as const).filter(
    (permission) => formData.get(permission) === "on",
  ) satisfies GmailPermission[]
  if (permissions.length === 0) {
    return { error: "Choose at least one thing Settlix may do." }
  }

  const origin = await siteOrigin()
  const existing = await getGmailConnection(
    createAdminClient(),
    member.workspace.id,
  )
  const state = newState()
  const pkce = newPkce()
  const jar = await cookies()
  jar.set(
    OAUTH_COOKIE,
    sealOAuthState({
      state,
      verifier: pkce.verifier,
      merchantId: member.workspace.id,
      userId: member.userId,
      permissions,
      createdAt: Date.now(),
    }),
    {
      httpOnly: true,
      secure: origin.startsWith("https://"),
      sameSite: "lax",
      path: OAUTH_COOKIE_PATH,
      maxAge: OAUTH_TTL_SECONDS,
    },
  )

  redirect(
    authorizationUrl({
      client: { clientId: config.clientId, redirectUri: callbackUrl(origin) },
      permissions,
      state,
      codeChallenge: pkce.challenge,
      // Reconnecting goes straight to the same Google account.
      loginHint: existing?.email ?? member.email,
    }),
  )
}

/** Removes Settlix's access: revokes the token at Google and deletes it here. */
export async function disconnectGmail(): Promise<GmailActionState> {
  const member = await requireMember()
  if (!can.manageStore(member.role)) {
    return { error: "Only owners and admins can disconnect Gmail." }
  }
  const config = gmailConfig()
  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from("gmail_connections")
    .select("google_email, refresh_token_ciphertext")
    .eq("merchant_id", member.workspace.id)
    .maybeSingle()
  if (error) throw new Error("Could not load the connection", { cause: error })
  if (!row) return {}

  if (config) {
    try {
      await revokeToken(
        decryptSecret(
          row.refresh_token_ciphertext,
          refreshContext(member.workspace.id),
          config.encryptionKey,
        ),
      )
    } catch {
      // The token is unreadable or already gone; deleting it is what matters.
    }
  }
  const { error: deleteError } = await admin
    .from("gmail_connections")
    .delete()
    .eq("merchant_id", member.workspace.id)
  if (deleteError) {
    throw new Error("Could not disconnect Gmail", { cause: deleteError })
  }
  await recordAuditEvent(admin, {
    merchantId: member.workspace.id,
    actor: { type: "user", id: member.userId },
    eventType: "gmail.disconnected",
    summary: `Gmail (${row.google_email}) disconnected. Settlix's access was revoked.`,
  })
  refresh()
  return {}
}

export type CheckGmailResult =
  | { status: "done"; created: number; followUps: number; toSort: number }
  | { status: "busy" | "not_reading" | "rate_limited" }
  | { status: "error"; message: string }

/**
 * "Check Gmail now" (and the inbox's automatic check). New requests and
 * replies are acknowledged and checked by Claude after the response.
 */
export async function checkGmailNow(): Promise<CheckGmailResult> {
  const member = await requireMember()
  if (!can.investigate(member.role)) return { status: "error", message: "Your role can't do this." }
  const admin = createAdminClient()
  if (!(await consumeRateLimit(admin, member.workspace.id, "gmail.sync"))) {
    return { status: "rate_limited" }
  }
  const result: SyncResult = await syncGmail(member.workspace.id)
  if (result.status === "error") {
    refresh()
    return { status: "error", message: result.message }
  }
  if (result.status !== "synced") return { status: result.status }

  const merchantId = member.workspace.id
  const storeName = member.workspace.name
  const origin = await siteOrigin()
  const { data: store } = await admin
    .from("merchants")
    .select("auto_check_requests")
    .eq("id", merchantId)
    .single()
  if (result.newCaseIds.length || result.recheckCaseIds.length) {
    after(async () => {
      for (const caseId of result.newCaseIds) {
        await acknowledgeRequest({
          admin: createAdminClient(),
          merchantId,
          storeName,
          caseId,
          origin,
        }).catch(() => console.error("Could not acknowledge", { caseId }))
      }
      if (!store?.auto_check_requests) return
      for (const caseId of [...result.newCaseIds, ...result.recheckCaseIds]) {
        await autoCheckRequest(merchantId, caseId).catch(() =>
          console.error("Automatic check failed", { caseId }),
        )
      }
    })
  }
  refresh()
  return {
    status: "done",
    created: result.created,
    followUps: result.followUps,
    toSort: result.toSort,
  }
}
