import { cn } from "@/lib/utils"

/**
 * Settlix mark: a receipt with a torn edge and a tick, on the brand tile.
 * The receipt is the product's own artefact (every case ends in one).
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-stage text-stage-foreground",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="none">
        <path
          d="M5 3.5h14v17l-2.33-1.5-2.34 1.5L12 19l-2.33 1.5L7.33 19 5 20.5z"
          fill="currentColor"
          fillOpacity={0.18}
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinejoin="round"
        />
        <path
          d="m8.5 11.25 2.5 2.5 4.5-5"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

export function BrandLockup({
  className,
  caption,
}: {
  className?: string
  /** A second line under the name, e.g. the workspace. */
  caption?: React.ReactNode
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark />
      <span className="grid min-w-0 text-left leading-tight">
        <span className="truncate text-[1.0625rem] font-bold tracking-tight">
          Settlix
        </span>
        {caption ? (
          <span className="truncate text-xs text-muted-foreground">
            {caption}
          </span>
        ) : null}
      </span>
    </span>
  )
}
