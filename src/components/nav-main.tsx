"use client"

import { Suspense } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { isActivePath, type NavItem } from "@/lib/navigation"

type Badges = Partial<Record<string, React.ReactNode>>

function NavMenu({
  items,
  pathname,
  badges,
}: {
  items: NavItem[]
  pathname: string | null
  badges?: Badges
}) {
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <SidebarMenu className="gap-1">
      {items.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton
            tooltip={item.title}
            isActive={isActivePath(pathname, item.href)}
            className="h-10 text-[0.9375rem] data-active:font-semibold [&_svg]:size-[1.125rem]"
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
          {badges?.[item.href] ? (
            <SidebarMenuBadge className="h-6 min-w-6 rounded-full bg-foreground px-1.5 text-background peer-hover/menu-button:text-background peer-data-[size=default]/menu-button:top-2 peer-data-active/menu-button:text-background">
              {badges[item.href]}
            </SidebarMenuBadge>
          ) : null}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

function ActiveNavMenu(props: { items: NavItem[]; badges?: Badges }) {
  const pathname = usePathname()
  return <NavMenu {...props} pathname={pathname} />
}

/**
 * usePathname suspends on routes with unknown dynamic params (Cache Components),
 * so the active-state menu streams in while the static menu renders in the shell.
 */
export function NavMain({
  items,
  label,
  badges,
  ...props
}: {
  items: NavItem[]
  label?: string
  badges?: Badges
} & React.ComponentProps<typeof SidebarGroup>) {
  return (
    <SidebarGroup {...props}>
      {label ? (
        <SidebarGroupLabel className="text-[0.8125rem]">
          {label}
        </SidebarGroupLabel>
      ) : null}
      <SidebarGroupContent>
        <Suspense
          fallback={<NavMenu items={items} pathname={null} badges={badges} />}
        >
          <ActiveNavMenu items={items} badges={badges} />
        </Suspense>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
