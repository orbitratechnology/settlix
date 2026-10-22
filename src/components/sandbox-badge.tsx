import { FlaskConicalIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"

/** Persistent reminder that every payment action runs against the PayPal Sandbox. */
export function SandboxBadge() {
  return (
    <Badge
      variant="outline"
      title="All PayPal operations use the PayPal Sandbox"
    >
      <FlaskConicalIcon data-icon="inline-start" />
      <span className="hidden sm:inline">PayPal</span> Sandbox
    </Badge>
  )
}
