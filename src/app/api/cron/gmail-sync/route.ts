import { timingSafeEqual } from "node:crypto"

import { NextResponse, type NextRequest } from "next/server"

import { syncGmail } from "@/lib/gmail/sync"
import { acknowledgeRequest } from "@/lib/intake/outbound"
import { autoCheckRequest } from "@/lib/intake/service"
import { siteOrigin } from "@/lib/site"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 60

/** Time left for acknowledgements and Claude checks after the syncs. */
const BUDGET_MS = 45_000

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get("authorization") ?? ""
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(header)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

/**
 * Daily safety net (Vercel Cron, see vercel.json): checks every store's Gmail
 * that allows reading, in case nobody opened Settlix that day. Vercel sends
 * `Authorization: Bearer $CRON_SECRET`; without the secret this does nothing.
 */
export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 })
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const started = Date.now()
  const admin = createAdminClient()
  const { data: connections, error } = await admin
    .from("gmail_connections")
    .select("merchant_id, merchant:merchants!inner(name, auto_check_requests)")
    .eq("status", "active")
    .contains("scopes", ["https://www.googleapis.com/auth/gmail.readonly"])
    .limit(25)
  if (error) throw new Error("Could not list connections", { cause: error })

  const origin = await siteOrigin()
  const results: Record<string, string> = {}
  for (const connection of connections) {
    try {
      const result = await syncGmail(connection.merchant_id)
      results[connection.merchant_id] = result.status
      if (result.status !== "synced") continue
      for (const caseId of result.newCaseIds) {
        if (Date.now() - started > BUDGET_MS) break
        await acknowledgeRequest({
          admin,
          merchantId: connection.merchant_id,
          storeName: connection.merchant.name,
          caseId,
          origin,
        }).catch(() => undefined)
      }
      if (!connection.merchant.auto_check_requests) continue
      for (const caseId of [...result.newCaseIds, ...result.recheckCaseIds]) {
        // Unchecked requests simply wait for the merchant.
        if (Date.now() - started > BUDGET_MS) break
        await autoCheckRequest(connection.merchant_id, caseId).catch(
          () => undefined,
        )
      }
    } catch {
      results[connection.merchant_id] = "failed"
    }
  }
  return NextResponse.json({ synced: Object.keys(results).length, results })
}
