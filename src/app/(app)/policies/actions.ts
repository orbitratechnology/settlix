"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { recordAuditEvent } from "@/lib/audit/events"
import { payPalToMinor } from "@/lib/paypal/money"
import { can, requireMember, type Member } from "@/lib/security/auth"
import { createAdminClient } from "@/lib/supabase/admin"
import { Constants } from "@/types/database"

export type PolicyFormState = {
  error?: string
  fieldErrors?: Partial<Record<string, string>>
  saved?: boolean
}

export type PolicyActionResult = { error?: string }

const UNIQUE_VIOLATION = "23505"

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-01.")

const detailsSchema = z.object({
  description: z.string().trim().max(2000).optional(),
  returnWindowDays: z
    .string()
    .trim()
    .regex(/^(\d{1,3})?$/, "Enter a whole number of days.")
    .optional(),
  manualReviewAbove: z
    .string()
    .trim()
    .max(20)
    .regex(/^(\d+(\.\d{1,2})?)?$/, "Use an amount like 500.00.")
    .optional(),
  effectiveFrom: dateSchema,
  effectiveUntil: z.union([z.literal(""), dateSchema]).optional(),
})

const createSchema = detailsSchema.extend({
  name: z.string().trim().min(1, "Name the policy.").max(120),
})

const clauseSchema = z.object({
  clauseId: z.union([z.literal(""), z.uuid()]).optional(),
  clauseKey: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,4}-[0-9]{1,3}$/, "Use an ID like FR-1 or EV-12."),
  title: z.string().trim().min(1, "Give the rule a title.").max(160),
  clauseType: z.enum(Constants.public.Enums.clause_type, {
    error: "Choose a rule type.",
  }),
  content: z
    .string()
    .trim()
    .min(1, "Write the rule text.")
    .max(4000, "Keep a rule under 4,000 characters."),
})

const idSchema = z.uuid()

function fieldErrorsOf(error: z.ZodError): PolicyFormState {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form")
    fieldErrors[key] ??= issue.message
  }
  return { error: "Check the highlighted fields.", fieldErrors }
}

async function requirePolicyManager(): Promise<Member | null> {
  const member = await requireMember()
  return can.managePolicies(member.role) ? member : null
}

const notAllowed = "Your role can't change policies."

/** Converts validated form details into column values, or field errors. */
function toColumns(
  input: z.infer<typeof detailsSchema>,
  currency: string,
):
  | { ok: true; columns: ReturnType<typeof columnsOf> }
  | { ok: false; state: PolicyFormState } {
  const days = input.returnWindowDays ? Number(input.returnWindowDays) : null
  if (days !== null && days > 365) {
    return {
      ok: false,
      state: { fieldErrors: { returnWindowDays: "Use 365 days or fewer." } },
    }
  }
  let threshold: number | null = null
  if (input.manualReviewAbove) {
    threshold = payPalToMinor({
      currency_code: currency,
      value: input.manualReviewAbove,
    })
    if (threshold <= 0) {
      return {
        ok: false,
        state: {
          fieldErrors: { manualReviewAbove: "Use an amount above zero." },
        },
      }
    }
  }
  if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) {
    return {
      ok: false,
      state: {
        fieldErrors: { effectiveUntil: "End after the effective date." },
      },
    }
  }
  return { ok: true, columns: columnsOf(input, days, threshold) }
}

function columnsOf(
  input: z.infer<typeof detailsSchema>,
  days: number | null,
  threshold: number | null,
) {
  return {
    description: input.description || null,
    return_window_days: days,
    manual_review_above_minor: threshold,
    effective_from: input.effectiveFrom,
    effective_until: input.effectiveUntil || null,
  }
}

async function loadPolicy(member: Member, policyId: string) {
  if (!idSchema.safeParse(policyId).success) return null
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("return_policies")
    .select("id, name, version, published_at, is_active")
    .eq("merchant_id", member.workspace.id)
    .eq("id", policyId)
    .maybeSingle()
  if (error) throw new Error("Could not load the policy", { cause: error })
  return data
}

/** Creates version 1 of a new policy as an editable draft. */
export async function createPolicy(
  _previous: PolicyFormState,
  formData: FormData,
): Promise<PolicyFormState> {
  const member = await requirePolicyManager()
  if (!member) return { error: notAllowed }

  const parsed = createSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return fieldErrorsOf(parsed.error)
  const converted = toColumns(parsed.data, member.workspace.defaultCurrency)
  if (!converted.ok) return converted.state

  const admin = createAdminClient()
  const { data, error } = await admin
    .from("return_policies")
    .insert({
      merchant_id: member.workspace.id,
      name: parsed.data.name,
      version: 1,
      ...converted.columns,
      created_by: member.userId,
    })
    .select("id")
    .single()
  if (error?.code === UNIQUE_VIOLATION) {
    return {
      fieldErrors: {
        name: "A policy with this name exists. Open it and create a new version.",
      },
    }
  }
  if (error) throw new Error("Could not create the policy", { cause: error })

  await recordAuditEvent(admin, {
    merchantId: member.workspace.id,
    actor: { type: "user", id: member.userId },
    eventType: "policy.draft_created",
    summary: `Draft policy "${parsed.data.name}" v1 created.`,
    metadata: { policy_id: data.id, version: 1 },
  })
  redirect(`/policies/${data.id}`)
}

/** Edits a draft's details. Published versions are immutable (DB-enforced). */
export async function updatePolicyDraft(
  policyId: string,
  _previous: PolicyFormState,
  formData: FormData,
): Promise<PolicyFormState> {
  const member = await requirePolicyManager()
  if (!member) return { error: notAllowed }
  const policy = await loadPolicy(member, policyId)
  if (!policy) return { error: "Policy not found." }
  if (policy.published_at) {
    return {
      error: "Published versions can't be edited. Create a new version.",
    }
  }

  const parsed = detailsSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return fieldErrorsOf(parsed.error)
  const converted = toColumns(parsed.data, member.workspace.defaultCurrency)
  if (!converted.ok) return converted.state

  const { error } = await createAdminClient()
    .from("return_policies")
    .update(converted.columns)
    .eq("merchant_id", member.workspace.id)
    .eq("id", policy.id)
    .is("published_at", null)
  if (error) throw new Error("Could not save the policy", { cause: error })
  refresh()
  return { saved: true }
}

/** Adds or edits a clause on a draft version. */
export async function saveClause(
  policyId: string,
  _previous: PolicyFormState,
  formData: FormData,
): Promise<PolicyFormState> {
  const member = await requirePolicyManager()
  if (!member) return { error: notAllowed }
  const policy = await loadPolicy(member, policyId)
  if (!policy) return { error: "Policy not found." }
  if (policy.published_at) {
    return {
      error: "Published versions can't be edited. Create a new version.",
    }
  }

  const parsed = clauseSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return fieldErrorsOf(parsed.error)
  const { clauseId, clauseKey, title, clauseType, content } = parsed.data
  const values = {
    clause_key: clauseKey,
    title,
    clause_type: clauseType,
    content,
  }

  const admin = createAdminClient()
  let error
  if (clauseId) {
    ;({ error } = await admin
      .from("policy_clauses")
      .update(values)
      .eq("merchant_id", member.workspace.id)
      .eq("policy_id", policy.id)
      .eq("id", clauseId))
  } else {
    const { data: last } = await admin
      .from("policy_clauses")
      .select("position")
      .eq("merchant_id", member.workspace.id)
      .eq("policy_id", policy.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle()
    ;({ error } = await admin.from("policy_clauses").insert({
      ...values,
      merchant_id: member.workspace.id,
      policy_id: policy.id,
      position: (last?.position ?? 0) + 1,
    }))
  }
  if (error?.code === UNIQUE_VIOLATION) {
    return {
      fieldErrors: {
        clauseKey: "This version already has a clause with this ID.",
      },
    }
  }
  if (error) throw new Error("Could not save the clause", { cause: error })
  refresh()
  return { saved: true }
}

export async function deleteClause(
  policyId: string,
  clauseId: string,
): Promise<PolicyActionResult> {
  const member = await requirePolicyManager()
  if (!member) return { error: notAllowed }
  const policy = await loadPolicy(member, policyId)
  if (!policy || !idSchema.safeParse(clauseId).success) {
    return { error: "Rule not found." }
  }
  if (policy.published_at) {
    return {
      error: "Published versions can't be edited. Create a new version.",
    }
  }
  const { error } = await createAdminClient()
    .from("policy_clauses")
    .delete()
    .eq("merchant_id", member.workspace.id)
    .eq("policy_id", policy.id)
    .eq("id", clauseId)
  if (error) throw new Error("Could not delete the clause", { cause: error })
  refresh()
  return {}
}

export async function deletePolicyDraft(
  policyId: string,
): Promise<PolicyActionResult> {
  const member = await requirePolicyManager()
  if (!member) return { error: notAllowed }
  const policy = await loadPolicy(member, policyId)
  if (!policy) return { error: "Policy not found." }
  if (policy.published_at) {
    return { error: "Published versions are kept for the audit trail." }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("return_policies")
    .delete()
    .eq("merchant_id", member.workspace.id)
    .eq("id", policy.id)
    .is("published_at", null)
  if (error) throw new Error("Could not delete the draft", { cause: error })

  await recordAuditEvent(admin, {
    merchantId: member.workspace.id,
    actor: { type: "user", id: member.userId },
    eventType: "policy.draft_deleted",
    summary: `Draft "${policy.name}" v${policy.version} deleted.`,
    metadata: { policy_id: policy.id, version: policy.version },
  })
  redirect("/policies")
}

/** Copies a version and its clauses into a new draft with the next version number. */
export async function createPolicyVersion(
  policyId: string,
): Promise<PolicyActionResult> {
  const member = await requirePolicyManager()
  if (!member) return { error: notAllowed }
  if (!idSchema.safeParse(policyId).success)
    return { error: "Policy not found." }

  const admin = createAdminClient()
  const merchantId = member.workspace.id
  const { data: source, error: sourceError } = await admin
    .from("return_policies")
    .select(
      `name, version, description, content, return_window_days,
       manual_review_above_minor, effective_from, effective_until,
       clauses:policy_clauses!policy_clauses_merchant_id_policy_id_fkey(
         clause_key, title, content, clause_type, position
       )`,
    )
    .eq("merchant_id", merchantId)
    .eq("id", policyId)
    .maybeSingle()
  if (sourceError) {
    throw new Error("Could not load the policy", { cause: sourceError })
  }
  if (!source) return { error: "Policy not found." }

  const { data: latest, error: latestError } = await admin
    .from("return_policies")
    .select("version")
    .eq("merchant_id", merchantId)
    .eq("name", source.name)
    .order("version", { ascending: false })
    .limit(1)
    .single()
  if (latestError) {
    throw new Error("Could not read policy versions", { cause: latestError })
  }

  const version = latest.version + 1
  const { data: draft, error: insertError } = await admin
    .from("return_policies")
    .insert({
      merchant_id: merchantId,
      name: source.name,
      version,
      description: source.description,
      content: source.content,
      return_window_days: source.return_window_days,
      manual_review_above_minor: source.manual_review_above_minor,
      effective_from: source.effective_from,
      effective_until: source.effective_until,
      created_by: member.userId,
    })
    .select("id")
    .single()
  if (insertError?.code === UNIQUE_VIOLATION) {
    return { error: "Another draft was just created. Refresh and try again." }
  }
  if (insertError) {
    throw new Error("Could not create the version", { cause: insertError })
  }

  if (source.clauses.length > 0) {
    const { error: clauseError } = await admin.from("policy_clauses").insert(
      source.clauses.map((clause) => ({
        ...clause,
        merchant_id: merchantId,
        policy_id: draft.id,
      })),
    )
    if (clauseError) {
      throw new Error("Could not copy the clauses", { cause: clauseError })
    }
  }

  await recordAuditEvent(admin, {
    merchantId,
    actor: { type: "user", id: member.userId },
    eventType: "policy.draft_created",
    summary: `Draft "${source.name}" v${version} created from v${source.version}.`,
    metadata: { policy_id: draft.id, version, source_version: source.version },
  })
  redirect(`/policies/${draft.id}`)
}

/**
 * Publishes a draft (making it immutable) or re-activates an older version.
 * The previously active version of the same policy is deactivated atomically.
 */
export async function activatePolicy(
  policyId: string,
): Promise<PolicyActionResult> {
  const member = await requirePolicyManager()
  if (!member) return { error: notAllowed }
  const policy = await loadPolicy(member, policyId)
  if (!policy) return { error: "Policy not found." }
  if (policy.is_active) return {}

  const admin = createAdminClient()
  const { error } = await admin.rpc("activate_policy_version", {
    p_merchant_id: member.workspace.id,
    p_policy_id: policy.id,
  })
  if (error?.message.includes("at least one clause")) {
    return { error: "Add at least one rule before publishing." }
  }
  if (error) throw new Error("Could not activate the policy", { cause: error })

  const published = !policy.published_at
  await recordAuditEvent(admin, {
    merchantId: member.workspace.id,
    actor: { type: "user", id: member.userId },
    eventType: published ? "policy.published" : "policy.activated",
    summary: `"${policy.name}" v${policy.version} ${published ? "published and activated" : "activated"}.`,
    metadata: { policy_id: policy.id, version: policy.version },
  })
  refresh()
  return {}
}

export async function deactivatePolicy(
  policyId: string,
): Promise<PolicyActionResult> {
  const member = await requirePolicyManager()
  if (!member) return { error: notAllowed }
  const policy = await loadPolicy(member, policyId)
  if (!policy) return { error: "Policy not found." }
  if (!policy.is_active) return {}

  const admin = createAdminClient()
  const { error } = await admin
    .from("return_policies")
    .update({ is_active: false })
    .eq("merchant_id", member.workspace.id)
    .eq("id", policy.id)
  if (error)
    throw new Error("Could not deactivate the policy", { cause: error })

  await recordAuditEvent(admin, {
    merchantId: member.workspace.id,
    actor: { type: "user", id: member.userId },
    eventType: "policy.deactivated",
    summary: `"${policy.name}" v${policy.version} deactivated.`,
    metadata: { policy_id: policy.id, version: policy.version },
  })
  refresh()
  return {}
}
