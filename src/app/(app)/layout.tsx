import { Suspense } from "react"

import { AppSidebar } from "@/components/app-sidebar"
import { NavUserSkeleton } from "@/components/nav-user"
import { SidebarUser } from "@/components/sidebar-user"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { getAttentionCount } from "@/lib/data/dashboard"

async function AttentionCount() {
  const count = await getAttentionCount()
  if (count === 0) return null
  return <span aria-label={`${count} need attention`}>{count}</span>
}

/**
 * Framed sheet: the sidebar and the top bar share one tinted frame, and the
 * page sits on a white sheet inset from the window's right and bottom edges.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 68)",
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        badges={{
          // Request-time data, so the count streams in after the shell.
          "/cases": (
            <Suspense fallback={null}>
              <AttentionCount />
            </Suspense>
          ),
        }}
        user={
          // The session is request-time data, so the account menu streams in.
          <Suspense fallback={<NavUserSkeleton />}>
            <SidebarUser />
          </Suspense>
        }
      />
      <SidebarInset className="bg-sidebar md:peer-data-[variant=inset]:m-0 md:peer-data-[variant=inset]:rounded-none md:peer-data-[variant=inset]:shadow-none md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-0 md:peer-data-[variant=inset]:peer-data-[state=collapsed]:pl-2">
        <SiteHeader />
        <main className="flex flex-1 flex-col bg-background md:mr-2 md:mb-2 md:rounded-2xl md:border">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
