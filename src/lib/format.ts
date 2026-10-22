const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
})

// dateStyle/timeStyle cannot be combined with timeZoneName, so the zone is appended.
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

/** Server-rendered dates use UTC so output is deterministic. */
export function formatDate(value: string | Date) {
  return dateFormatter.format(new Date(value))
}

export function formatDateTime(value: string | Date) {
  return `${dateTimeFormatter.format(new Date(value))} UTC`
}

const shortDayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

/** "Oct 20" for chart axes and compact lists. */
export function formatShortDay(value: string | Date) {
  return shortDayFormatter.format(new Date(value))
}

/** "Today", "Yesterday", "3 days ago", then the date, counted in UTC days. */
export function formatAge(value: string | Date, now: Date = new Date()) {
  const day = (date: Date) =>
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  const days = Math.round((day(now) - day(new Date(value))) / 86_400_000)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 14) return `${days} days ago`
  return formatDate(value)
}
