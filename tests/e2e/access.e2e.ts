import { expect, test } from "@playwright/test"

import { postApi } from "./helpers"
import { DEMO_CASE_ID } from "./workspace"

/**
 * E2E-08: the E2E merchant can't read or change the demo merchant's case, and
 * nothing about it leaks (the demo case belongs to "Maya Chen").
 */
test.describe("E2E-08 unauthorized access", () => {
  test("another merchant's case, receipt, and actions are not found", async ({
    page,
  }) => {
    await page.goto(`/cases/${DEMO_CASE_ID}`)
    await expect(page.getByText("Page not found")).toBeVisible()
    await expect(page.getByText("Maya Chen")).toHaveCount(0)

    await page.goto(`/receipts/${DEMO_CASE_ID}`)
    await expect(page.getByText("Page not found")).toBeVisible()
    await expect(page.getByText("Maya Chen")).toHaveCount(0)

    for (const action of [
      "investigate",
      "approve-and-refund",
      "reconcile-refund",
    ]) {
      const response = await postApi(
        page,
        `/api/cases/${DEMO_CASE_ID}/${action}`,
        action === "approve-and-refund"
          ? {
              investigationId: crypto.randomUUID(),
              amountMinor: 8900,
              currencyCode: "USD",
            }
          : undefined,
      )
      expect(response.status(), action).toBe(404)
      expect(JSON.stringify(await response.json())).not.toContain("Maya")
    }
  })

  test("cross-site requests are rejected", async ({ page }) => {
    await page.goto("/cases")
    const response = await page.request.post(
      `${new URL(page.url()).origin}/api/cases/${DEMO_CASE_ID}/investigate`,
      {
        headers: { origin: "https://attacker.example" },
        failOnStatusCode: false,
      },
    )
    expect(response.status()).toBe(403)
  })

  test("signed-out visitors are sent to sign in", async ({ browser }) => {
    const context = await browser.newContext({ storageState: undefined })
    const page = await context.newPage()
    await page.goto("/cases")
    await expect(page).toHaveURL(/\/login/)
    const response = await postApi(
      page,
      `/api/cases/${DEMO_CASE_ID}/investigate`,
    )
    expect(response.status()).toBe(401)
    await context.close()
  })
})
