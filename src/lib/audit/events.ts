import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database, Json } from "@/types/database"

export type AuditEventInput = {
  merchantId: string
  caseId?: string | null
  actor: { type: "user"; id: string } | { type: "system" } | { type: "ai" }
  eventType: string
  summary: string
  metadata?: Record<string, Json | undefined>
}

/**
 * Appends an audit event (append-only table). Metadata must never contain
 * secrets, tokens, auth headers, or unnecessary personal data.
 */
export async function recordAuditEvent(
  admin: SupabaseClient<Database>,
  input: AuditEventInput,
) {
  const { error } = await admin.from("audit_events").insert({
    merchant_id: input.merchantId,
    case_id: input.caseId ?? null,
    actor_type: input.actor.type,
    actor_id: input.actor.type === "user" ? input.actor.id : null,
    event_type: input.eventType,
    event_summary: input.summary.slice(0, 500),
    metadata_json: (input.metadata ?? {}) as Json,
    origin: "app",
  })
  if (error) throw new Error("Could not record audit event", { cause: error })
}
