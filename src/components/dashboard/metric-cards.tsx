import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type Metric = {
  label: string
  /** Pre-formatted value; `null` renders an explicit "no data" state. */
  value: string | null
  note: string
}

/** Metric tiles in the shadcn dashboard style. Values always come from persisted records. */
export function MetricCards({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {metrics.map((metric) => (
        <Card key={metric.label} className="@container/card">
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
