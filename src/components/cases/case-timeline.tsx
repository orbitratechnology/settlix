import { BotIcon, ServerIcon, UserIcon } from "lucide-react"

import { OriginBadge } from "@/components/status-badges"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { CaseDetail } from "@/lib/data/cases"
import { formatDateTime } from "@/lib/format"

const actorIcons = {
  user: UserIcon,
  system: ServerIcon,
  ai: BotIcon,
} as const

const actorLabels = {
  user: "Merchant",
  system: "System",
  ai: "AI",
} as const

/** Append-only audit trail for the case (PRD §12.9). */
export function CaseTimeline({
  events,
}: {
  events: CaseDetail["audit_events"]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          The case&apos;s audit trail. Entries are never edited or removed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <ol className="flex flex-col">
            {events.map((event, index) => {
              const Icon = actorIcons[event.actor_type]
              const last = index === events.length - 1
              return (
                <li key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
                      <Icon className="size-3.5 text-muted-foreground" />
                    </span>
                    {last ? null : <span className="w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 pb-5">
                    <p className="text-sm">{event.event_summary}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span>{actorLabels[event.actor_type]}</span>
                      <span aria-hidden>·</span>
                      <time dateTime={event.created_at}>
                        {formatDateTime(event.created_at)}
                      </time>
                      <span aria-hidden>·</span>
                      <span className="font-mono">{event.event_type}</span>
                      <OriginBadge origin={event.origin} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
