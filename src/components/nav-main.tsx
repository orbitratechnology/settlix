"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { isActivePath, type NavItem } from "@/lib/navigation"

function NavMenu({
  items,
  pathname,
}: {
  items: NavItem[]
  pathname: string | null
}) {
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={isActivePath(pathname, item.href)}
            render={
              <Link
                href={item.href}
                onClick={isMobile ? () => setOpenMobile(false) : undefined}
              />
            }
          >
            <item.icon />
            <span>{item.title}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

function ActiveNavMenu({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return <NavMenu items={items} pathname={pathname} />
}

/**
 * usePathname suspends on routes with unknown dynamic params (Cache Components),
 * so the active-state menu streams in while the static menu renders in the shell.
 */
export function NavMain({
  items,
  label,
  ...props
}: { items: NavItem[]; label?: string } & React.ComponentProps<
  typeof SidebarGroup
>) {
  return (
    <SidebarGroup {...props}>
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <Suspense fallback={<NavMenu items={items} pathname={null} />}>
          <ActiveNavMenu items={items} />
        </Suspense>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
