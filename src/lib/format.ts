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
