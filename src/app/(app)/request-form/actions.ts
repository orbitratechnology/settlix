"use server"

import { refresh } from "next/cache"
import { z } from "zod"

import { recordAuditEvent } from "@/lib/audit/events"
import { can, requireMember } from "@/lib/security/auth"
import { createAdminClient } from "@/lib/supabase/admin"

export type SettingResult = { error?: string }

const settingSchema = z.object({
  setting: z.enum(["formEnabled", "autoCheck"]),
  value: z.boolean(),
})

const summaries = {
  formEnabled: (on: boolean) =>
    on ? "Request form turned on." : "Request form paused.",
  autoCheck: (on: boolean) =>
    on
      ? "Automatic Claude checks for new requests turned on."
      : "Automatic Claude checks for new requests turned off.",
}

/** Turns the public form, or Claude's automatic check of new requests, on or off. */
export async function updateRequestFormSetting(
  setting: "formEnabled" | "autoCheck",
  value: boolean,
): Promise<SettingResult> {
  const member = await requireMember()
  const parsed = settingSchema.safeParse({ setting, value })
  if (!parsed.success) return { error: "Unknown setting." }
  if (!can.manageStore(member.role)) {
    return { error: "Only owners and admins can change this." }
  }
  if (member.workspace.isDemo) {
    return {
      error:
        "The shared demo store keeps these settings so every visitor can try them.",
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("merchants")
    .update(
      parsed.data.setting === "formEnabled"
        ? { request_form_enabled: parsed.data.value }
        : { auto_check_requests: parsed.data.value },
    )
    .eq("id", member.workspace.id)
  if (error) throw new Error("Could not save the setting", { cause: error })

  await recordAuditEvent(admin, {
    merchantId: member.workspace.id,
    actor: { type: "user", id: member.userId },
    eventType: "store.settings_changed",
    summary: summaries[parsed.data.setting](parsed.data.value),
    metadata: { setting: parsed.data.setting, value: parsed.data.value },
  })
  refresh()
  return {}
}
