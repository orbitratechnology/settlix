import type { Metadata } from "next"
import { StoreIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { signOut } from "@/lib/security/actions"

export const metadata: Metadata = {
  title: "Workspace required",
}

export default function WorkspaceRequiredPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <StoreIcon />
          </EmptyMedia>
          <EmptyTitle>No merchant workspace</EmptyTitle>
          <EmptyDescription>
            Your account isn&apos;t a member of any merchant workspace yet. Ask
            a workspace owner to add you, or sign in with the demo account.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </EmptyContent>
      </Empty>
    </div>
  )
}
