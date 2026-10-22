import { AppBreadcrumbs } from "@/components/app-breadcrumbs"
import { CommandMenu } from "@/components/command-menu"
import { ModeToggle } from "@/components/mode-toggle"
import { SandboxBadge } from "@/components/sandbox-badge"
import { SidebarTrigger } from "@/components/ui/sidebar"

/** The top bar sits on the frame tint with the sidebar; no rule under it. */
export function SiteHeader() {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-3 px-3 md:px-2">
      <SidebarTrigger className="size-9" />
      <div className="hidden min-w-0 md:block">
        <AppBreadcrumbs />
      </div>
      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 md:pr-2">
        <CommandMenu />
        <SandboxBadge />
        <ModeToggle />
      </div>
    </header>
  )
}
