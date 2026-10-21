import {
  CreditCardIcon,
  InboxIcon,
  LayoutDashboardIcon,
  ScrollTextIcon,
  Settings2Icon,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
}

export const mainNav: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Resolution Inbox", href: "/cases", icon: InboxIcon },
  { title: "Policies", href: "/policies", icon: ScrollTextIcon },
  { title: "Payments", href: "/payments", icon: CreditCardIcon },
]

export const secondaryNav: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings2Icon },
]

/** Labels for static path segments, used by the header breadcrumbs. */
export const segmentLabels: Record<string, string> = {
  dashboard: "Dashboard",
  cases: "Resolution Inbox",
  policies: "Policies",
  payments: "Payments",
  settings: "Settings",
}

/** Labels for the record page under a section, e.g. /cases/<id> → "Case". */
export const detailLabels: Record<string, string> = {
  cases: "Case",
  policies: "Policy version",
  receipts: "Receipt",
}

export function breadcrumbLabel(segments: string[], index: number) {
  const segment = segments[index]
  const parent = index > 0 ? segments[index - 1] : undefined
  return (
    segmentLabels[segment] ??
    (parent ? detailLabels[parent] : undefined) ??
    decodeURIComponent(segment)
  )
}

export type Crumb = { href: string; label: string }

/** Header breadcrumbs for a pathname, one per segment. */
export function breadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean)
  // Receipts have no index page and a receipt's ID is its case ID, so the
  // trail runs through the case instead.
  if (segments[0] === "receipts" && segments.length === 2) {
    return [
      ...breadcrumbs(`/cases/${segments[1]}`),
      { href: pathname, label: detailLabels.receipts },
    ]
  }
  return segments.map((_, index) => ({
    href: `/${segments.slice(0, index + 1).join("/")}`,
    label: breadcrumbLabel(segments, index),
  }))
}

export function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}
