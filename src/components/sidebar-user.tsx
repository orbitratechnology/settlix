import { NavUser } from "@/components/nav-user"
import { getViewer } from "@/lib/security/auth"

const roleLabels = {
  owner: "Owner",
  admin: "Admin",
  reviewer: "Reviewer",
  support: "Support",
} as const

function initialsFor(value: string) {
  const letters = value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
  return letters || "?"
}

/** Server-rendered account summary; streams in after the static shell. */
export async function SidebarUser() {
  const viewer = await getViewer()
  if (viewer.status !== "member") return null

  const name = viewer.workspace.name
  return (
    <NavUser
      name={name}
      detail={`${viewer.email ?? "Signed in"} · ${roleLabels[viewer.role]}`}
      initials={initialsFor(name)}
    />
  )
}
