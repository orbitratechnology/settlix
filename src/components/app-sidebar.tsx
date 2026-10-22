"use client"

import Link from "next/link"

import { BrandLockup } from "@/components/brand"
import { NavMain } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { navGroups, secondaryNav } from "@/lib/navigation"

export function AppSidebar({
  user,
  badges,
  ...props
}: {
  user: React.ReactNode
  /** Counts beside nav items, keyed by href (streamed in by the layout). */
  badges?: Partial<Record<string, React.ReactNode>>
} & React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="px-3 pt-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
              <BrandLockup caption="Refund desk" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-2 px-1 pt-2">
        {navGroups.map((group) => (
          <NavMain
            key={group.label}
            label={group.label}
            items={group.items}
            badges={badges}
          />
        ))}
        <NavMain items={secondaryNav} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter className="px-3 pb-4">{user}</SidebarFooter>
    </Sidebar>
  )
}
