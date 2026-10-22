import { formatShortDay } from "@/lib/format"
import { formatMoney } from "@/lib/money/amounts"

/** A round top for the scale: 1, 2, 2.5 or 5 times a power of ten. */
function niceCeiling(value: number) {
  if (value <= 0) return 100
  const power = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (value <= step * power) return step * power
  }
  return 10 * power
}

/**
 * Money returned through PayPal per day: square-topped columns in the data
 * hue on a zero baseline, two round ticks, and dates at both ends.
 */
export function RefundsChart({
  days,
  currency,
}: {
  days: { day: string; minor: number }[]
  currency: string
}) {
  const max = niceCeiling(Math.max(...days.map((d) => d.minor)))
  const total = days.reduce((sum, d) => sum + d.minor, 0)
  const tick = (minor: number) =>
    formatMoney(Math.round(minor), currency).replace(/\.00$/, "")

  return (
    <figure
      role="img"
      aria-label={`Refunded through PayPal in the last ${days.length} days: ${formatMoney(total, currency)}.`}
      className="flex flex-col gap-2"
    >
      <div className="relative h-36 pl-12">
        {[1, 0.5, 0].map((share) => (
          <div
            key={share}
            aria-hidden
            className={
              share === 0
                ? "absolute inset-x-0 left-12 h-px bg-foreground/40"
                : "absolute inset-x-0 left-12 h-px bg-border"
            }
            style={{ bottom: `${share * 100}%` }}
          >
            <span className="absolute -top-2.5 -left-12 w-10 text-right text-xs text-muted-foreground">
              {tick(max * share)}
            </span>
          </div>
        ))}
        <div className="relative flex h-full items-end gap-[3px] sm:gap-1.5">
          {days.map((entry) => (
            <div
              key={entry.day}
              className="flex h-full flex-1 items-end"
              title={`${formatShortDay(entry.day)}: ${formatMoney(entry.minor, currency)}`}
            >
              {entry.minor > 0 ? (
                <div
                  className="w-full rounded-t-[3px] bg-primary"
                  style={{ height: `${(entry.minor / max) * 100}%` }}
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div
        aria-hidden
        className="flex justify-between pl-12 text-xs text-muted-foreground"
      >
        <span>{formatShortDay(days[0].day)}</span>
        <span>Today</span>
      </div>
    </figure>
  )
}
