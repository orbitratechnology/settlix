import type { Enums } from "@/types/database"

export type MemberRole = Enums<"member_role">

const roleRank: Record<MemberRole, number> = {
  support: 0,
  reviewer: 1,
  admin: 2,
  owner: 3,
}

/** Role capabilities (PRD §4, §12.2). Server code must check these before writes. */
export const can = {
  investigate: (role: MemberRole) => roleRank[role] >= roleRank.support,
  createCases: (role: MemberRole) => roleRank[role] >= roleRank.support,
  runSandboxCheckout: (role: MemberRole) => roleRank[role] >= roleRank.reviewer,
  approveRefunds: (role: MemberRole) => roleRank[role] >= roleRank.reviewer,
  managePolicies: (role: MemberRole) => roleRank[role] >= roleRank.admin,
}
