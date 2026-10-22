import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type Metric = {
  label: string
  /** Pre-formatted value; `null` renders an explicit "no data" state. */
  value: string | null
  note: string
}

/** Metric tiles in the shadcn dashboard style. Values always come from persisted records. */
export function MetricCards({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:gap-4 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {metrics.map((metric, index) => (
        <Card
          key={metric.label}
          className={cn(
            "@container/card",
            // An odd last tile spans two columns so both grids stay full.
            metrics.length % 2 === 1 &&
              index === metrics.length - 1 &&
              "col-span-2",
          )}
        >
          <CardHeader>
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {metric.value ?? (
                <span className="text-muted-foreground" aria-label="No data">
                  —
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardFooter className="text-sm text-muted-foreground">
            {metric.note}
          </CardFooter>
        </Card>
      ))}
    </div>
  )
}
