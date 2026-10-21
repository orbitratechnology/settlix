import "server-only"

import { cache } from "react"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { createClient } from "@/lib/supabase/server"
import type { Enums } from "@/types/database"

export type MemberRole = Enums<"member_role">

export type Workspace = {
  id: string
  name: string
  slug: string
  isDemo: boolean
  defaultCurrency: string
}

export type Member = {
  userId: string
  email: string | null
  role: MemberRole
  workspace: Workspace
}

export type Viewer =
  | { status: "anonymous" }
  | { status: "no-workspace"; userId: string; email: string | null }
  | ({ status: "member" } & Member)

/**
 * Resolves the signed-in user and their merchant membership on the server.
 * The JWT is verified by getClaims(); the membership comes from the database
 * through RLS, never from user-editable metadata. Deduplicated per request.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  // Session checks are per request: never prerendered or runtime-prefetched
  // (token validation also reads the current time).
  await connection()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims?.sub) {
    return { status: "anonymous" }
  }

  const userId = data.claims.sub
  const email = typeof data.claims.email === "string" ? data.claims.email : null

  const { data: membership, error: membershipError } = await supabase
    .from("merchant_members")
    .select(
      "role, merchant:merchants!inner(id, name, slug, is_demo, default_currency)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw new Error("Could not load workspace membership", {
      cause: membershipError,
    })
  }
  if (!membership) {
    return { status: "no-workspace", userId, email }
  }

  return {
    status: "member",
    userId,
    email,
    role: membership.role,
    workspace: {
      id: membership.merchant.id,
      name: membership.merchant.name,
      slug: membership.merchant.slug,
      isDemo: membership.merchant.is_demo,
      defaultCurrency: membership.merchant.default_currency,
    },
  }
})

/** Returns the current member or redirects; use at the top of protected data access. */
export async function requireMember(): Promise<Member> {
  const viewer = await getViewer()
  if (viewer.status === "anonymous") redirect("/login")
  if (viewer.status === "no-workspace") redirect("/workspace-required")
  return viewer
}

const roleRank: Record<MemberRole, number> = {
  support: 0,
  reviewer: 1,
  admin: 2,
  owner: 3,
}

/** Role capabilities (PRD §4, §12.2). Server code must check these before writes. */
export const can = {
  investigate: (role: MemberRole) => roleRank[role] >= roleRank.support,
  approveRefunds: (role: MemberRole) => roleRank[role] >= roleRank.reviewer,
  managePolicies: (role: MemberRole) => roleRank[role] >= roleRank.admin,
}
