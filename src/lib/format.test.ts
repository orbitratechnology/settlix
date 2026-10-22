import { describe, expect, test } from "bun:test"

import { formatAge, formatShortDay } from "./format"

describe("formatAge", () => {
  const now = new Date("2026-10-22T10:00:00Z")

  test("counts whole UTC days", () => {
    expect(formatAge("2026-10-22T01:00:00Z", now)).toBe("Today")
    expect(formatAge("2026-10-21T23:59:00Z", now)).toBe("Yesterday")
    expect(formatAge("2026-10-19T12:00:00Z", now)).toBe("3 days ago")
  })

  test("falls back to the date after two weeks", () => {
    expect(formatAge("2026-09-30T12:00:00Z", now)).toBe("Sep 30, 2026")
  })
})

test("formatShortDay", () => {
  expect(formatShortDay("2026-10-05")).toBe("Oct 5")
})
