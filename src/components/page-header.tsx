import { cn } from "@/lib/utils"

/** Page title, supporting description, and contextual actions. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 @2xl/main:flex-row @2xl/main:items-end @2xl/main:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em] break-words">
          {title}
        </h1>
        {description ? (
          <p className="max-w-[65ch] text-base text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  )
}

/** Standard page body spacing inside the dashboard shell. */
export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "@container/main flex flex-1 flex-col gap-6 p-4 sm:p-6 md:gap-8 lg:p-8",
        className,
      )}
    >
      {children}
    </div>
  )
}
