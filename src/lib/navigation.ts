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
  receipts: "Resolution Receipts",
}

/** Labels for the record page under a section, e.g. /cases/<id> → "Case". */
export const detailLabels: Record<string, string> = {
  cases: "Case",
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

export function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false
  return pathname === href || pathname.startsWith(`${href}/`)
}
