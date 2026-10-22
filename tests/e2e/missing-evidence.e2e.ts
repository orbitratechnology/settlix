import { expect, test } from "@playwright/test"

import {
  caseStatus,
  investigate,
  live,
  LIVE_SKIP_REASON,
  postApi,
  refundAttempts,
} from "./helpers"
import { adminDb, createSeedCase } from "./workspace"

test.skip(!live, LIVE_SKIP_REASON)

/**
 * E2E-03: a damage claim without the photo policy EV-1 requires. Claude asks for
 * evidence, the requirement is shown, and no refund action exists.
 */
test("E2E-03 missing evidence blocks the refund", async ({ page }) => {
  const created = await createSeedCase(adminDb(), {
    description: "Stoneware dinner plates, set of 4 (E2E fixture)",
    amountMinor: 6400,
    capturedDaysAgo: 6,
    case: {
      customer_display_name: "E2E Customer",
      request_category: "damaged_item",
      claimed_issue: "Two plates arrived cracked",
      customer_message:
        "Two of the four plates arrived cracked. Please refund them.",
      requested_amount_minor: 3200,
      supporting_details:
        "Carrier tracking confirms delivery two days ago. No photos have been received.",
    },
  })
  await page.goto(`/cases/${created.id}`)

  const response = await investigate(page)
  expect(response.status()).toBe(200)
  expect(await response.json()).toMatchObject({ outcome: "requires_evidence" })
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Needs evidence",
  )
  const missing = page
    .getByRole("heading", { name: "Missing information" })
    .locator("..")
  await expect(missing).toContainText(/photo/i)
  await expect(
    page.getByRole("button", { name: "Approve and issue refund" }),
  ).toHaveCount(0)

  const investigationId = (
    (await response.json()) as { investigationId: string }
  ).investigationId
  const attempt = await postApi(
    page,
    `/api/cases/${created.id}/approve-and-refund`,
    { investigationId, amountMinor: 3200, currencyCode: "USD" },
  )
  expect(attempt.status()).toBe(409)
  expect(await refundAttempts(created.id)).toHaveLength(0)
  expect(await caseStatus(created.id)).toBe("NEEDS_EVIDENCE")
})
