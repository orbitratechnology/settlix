import { ReceiptTextIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** Settlix mark: a receipt glyph on the brand tile. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground",
        className,
      )}
    >
      <ReceiptTextIcon className="size-4" />
    </div>
  )
}

export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <BrandMark />
      <span className="grid text-left leading-tight">
        <span className="truncate font-semibold">Settlix</span>
        <span className="truncate text-xs text-muted-foreground">
          Resolve payments intelligently
        </span>
      </span>
    </span>
  )
}
