import { cn } from "@/lib/utils"

export type Fact = {
  label: string
  value: React.ReactNode
}

/** Label/value pairs for record details; stacks on narrow containers. */
export function FactList({
  facts,
  className,
}: {
  facts: Fact[]
  className?: string
}) {
  return (
    <dl className={cn("grid gap-3 text-[0.9375rem]", className)}>
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="flex flex-col gap-0.5 @md/card:flex-row @md/card:justify-between @md/card:gap-4"
        >
          <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
          <dd className="min-w-0 font-medium break-words @md/card:text-right">
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
