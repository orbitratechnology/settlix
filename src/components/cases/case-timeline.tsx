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
  user: "Your team",
  system: "Settlix",
  ai: "Claude",
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
          Everything that happened on this request. Entries can&apos;t be edited
          or deleted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-[0.9375rem] text-muted-foreground">
            Nothing has happened yet.
          </p>
        ) : (
          <ol className="flex flex-col">
            {events.map((event, index) => {
              const Icon = actorIcons[event.actor_type]
              const last = index === events.length - 1
              return (
                <li key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className="size-4 text-muted-foreground" />
                    </span>
                    {last ? null : <span className="w-px flex-1 bg-border" />}
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 pb-6">
                    <p className="text-[0.9375rem]">{event.event_summary}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {actorLabels[event.actor_type]}
                      </span>
                      <time dateTime={event.created_at}>
                        {formatDateTime(event.created_at)}
                      </time>
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
