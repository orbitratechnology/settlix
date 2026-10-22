import "server-only"

import { sourceLabel } from "@/lib/intake/sources"
import { requireMember } from "@/lib/security/auth"
import { createClient } from "@/lib/supabase/server"

const SOURCE_DAYS = 30

export type SourceCount = { label: string; count: number }

/** The request form's settings and where its requests came from lately. */
export async function getRequestFormOverview() {
  const member = await requireMember()
  const supabase = await createClient()
  const since = new Date(Date.now() - SOURCE_DAYS * 86_400_000).toISOString()

  const [merchant, recent] = await Promise.all([
    supabase
      .from("merchants")
      .select("request_form_enabled, auto_check_requests")
      .eq("id", member.workspace.id)
      .single(),
    supabase
      .from("cases")
      .select("channel, channel_source")
      .eq("merchant_id", member.workspace.id)
      .in("channel", ["form", "email"])
      .gte("created_at", since)
      .limit(1000),
  ])
  if (merchant.error) {
    throw new Error("Could not load the store", { cause: merchant.error })
  }
  if (recent.error) {
    throw new Error("Could not load requests", { cause: recent.error })
  }

  const counts = new Map<string, number>()
  for (const row of recent.data) {
    const label =
      row.channel === "email"
        ? "Gmail"
        : (sourceLabel(row.channel_source) ?? "Form link")
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }

  return {
    member,
    formEnabled: merchant.data.request_form_enabled,
    autoCheck: merchant.data.auto_check_requests,
    sources: [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count) satisfies SourceCount[],
    sourceDays: SOURCE_DAYS,
  }
}
