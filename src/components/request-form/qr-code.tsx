import { qrPath } from "@/lib/qr"
import { cn } from "@/lib/utils"

/**
 * The QR code drawn as an inline SVG (dark modules on white, with the quiet
 * zone scanners need), so it reads in both themes and when printed.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string
  label: string
  className?: string
}) {
  const { size, d } = qrPath(value)
  const quiet = 4
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`}
      shapeRendering="crispEdges"
      className={cn("aspect-square rounded-lg bg-white", className)}
    >
      <path d={d} fill="#000" />
    </svg>
  )
}
