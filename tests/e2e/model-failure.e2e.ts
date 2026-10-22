import { expect, test } from "@playwright/test"

import { caseStatus, investigate, refundAttempts, withFault } from "./helpers"
import { adminDb, createSeedCase } from "./workspace"

/**
 * E2E-06: Claude times out or returns an invalid structure (test faults, no
 * model call). The case is preserved, nothing is stored as a recommendation,
 * and no refund is possible.
 */
test("E2E-06 a model failure preserves the case and allows no refund", async ({
  page,
}) => {
  const db = adminDb()
  const created = await createSeedCase(db, {
    description: "Ceramic mug set (E2E fixture)",
    amountMinor: 3600,
    capturedDaysAgo: 5,
    case: {
      customer_display_name: "E2E Customer",
      request_category: "damaged_item",
      claimed_issue: "One mug arrived chipped",
      customer_message: "One of the mugs arrived with a chipped rim.",
      requested_amount_minor: 900,
      supporting_details: null,
    },
  })
  await page.goto(`/cases/${created.id}`)

  for (const [fault, message] of [
    ["ai_timeout", "Claude didn't respond in time"],
    ["ai_invalid_output", "invalid recommendation, so it was discarded"],
  ] as const) {
    const undo = await withFault(page, "**/api/cases/*/investigate", fault)
    const response = await investigate(page)
    await undo()
    // The header proves the server applied the fault (no model was called).
    expect(response.headers()["x-settlix-test-fault"]).toBe(fault)
    expect(response.status()).toBe(502)
    const alert = page
      .getByRole("alert")
      .filter({ hasText: "Investigation failed" })
    await expect(alert).toContainText(message)
    expect(await caseStatus(created.id)).toBe("NEW")
  }

  const { count } = await db
    .from("investigations")
    .select("id", { count: "exact", head: true })
    .eq("case_id", created.id)
  expect(count).toBe(0)
  expect(await refundAttempts(created.id)).toHaveLength(0)
  await expect(
    page.getByRole("button", { name: "Approve and issue refund" }),
  ).toHaveCount(0)
})
