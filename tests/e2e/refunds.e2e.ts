import { expect, test, type Page } from "@playwright/test"

import {
  caseStatus,
  createCaseForCapture,
  investigate,
  live,
  LIVE_SKIP_REASON,
  paypalGet,
  paypalRefundsForCapture,
  postApi,
  refundAttempts,
  sandboxCheckout,
  withFault,
  type CaseInput,
} from "./helpers"

/**
 * PRD §17.3 refund flows against the real PayPal Sandbox and Claude: each test
 * makes its own sandbox payment in the E2E workspace and checks PayPal's own
 * record, not just what Settlix shows.
 */
test.skip(!live, LIVE_SKIP_REASON)

/** A fresh payment fits one honest scenario: cancelling before dispatch (CN-1). */
const cancellation = (amount: string): CaseInput => ({
  customer: "E2E Buyer",
  category: "Changed mind",
  issue: "Ordered by mistake; asked to cancel before it ships",
  message: `Hi, I just paid for this by mistake. Please cancel the order before it ships and refund the $${amount}. Thanks!`,
  requested: amount,
  notes:
    "Fulfillment queue checked when the request arrived: the order had not been packed or shipped. Staff cancelled it before dispatch; the item never left our stock and is unused in its original packaging. No shipping was charged.",
})

/** Investigates and requires Claude + the engine to make the case approvable. */
async function investigateUntilReady(page: Page) {
  const response = await investigate(page)
  expect(response.status()).toBe(200)
  const body = (await response.json()) as {
    investigationId: string
    outcome: string
  }
  expect(body.outcome, "Claude's recommendation and the checks").toBe(
    "eligible_for_approval",
  )
  await expect(page.getByTestId("case-status")).toContainText(
    "Ready to approve",
  )
  return body.investigationId
}

/** Opens the approval dialog, confirms, and returns the result alert. */
async function approveInDialog(page: Page, { doubleClick = false } = {}) {
  await page.getByRole("button", { name: "Approve and issue refund" }).click()
  const dialog = page.getByRole("alertdialog")
  const confirm = dialog.getByRole("button", {
    name: "Approve and issue refund",
  })
  if (doubleClick) await confirm.dblclick()
  else await confirm.click()
  const result = dialog.getByRole("alert")
  await expect(result).toBeVisible({ timeout: 90_000 })
  return { dialog, result }
}

const refundIdIn = async (text: Promise<string | null>) =>
  (await text)!.match(/PayPal reference (\w+)\)/)![1]

test("E2E-01 full refund to receipt, with E2E-04 and a double click", async ({
  page,
}) => {
  const captureId = await sandboxCheckout(page, "Linen napkins")
  const caseId = await createCaseForCapture(
    page,
    captureId,
    cancellation("24.00"),
  )
  const investigationId = await investigateUntilReady(page)

  // E2E-04: more than the remaining balance is rejected before any claim.
  const tampered = await postApi(
    page,
    `/api/cases/${caseId}/approve-and-refund`,
    { investigationId, amountMinor: 2401, currencyCode: "USD" },
  )
  expect(tampered.status()).toBe(409)
  expect(await tampered.json()).toMatchObject({ code: "changed" })
  expect(await refundAttempts(caseId)).toHaveLength(0)

  const { dialog, result } = await approveInDialog(page, { doubleClick: true })
  await expect(result).toContainText("Refund completed")
  const refundId = await refundIdIn(result.textContent())

  const refund = await paypalGet<{
    status: string
    amount: { value: string; currency_code: string }
  }>(`/v2/payments/refunds/${refundId}`)
  expect(refund).toMatchObject({
    status: "COMPLETED",
    amount: { value: "24.00", currency_code: "USD" },
  })
  expect(await paypalRefundsForCapture(captureId)).toHaveLength(1)
  expect(await refundAttempts(caseId)).toHaveLength(1)

  await dialog.getByRole("link", { name: "Open receipt" }).click()
  await expect(page).toHaveURL(new RegExp(`/receipts/${caseId}$`))
  await expect(page.getByText("Completed, 24.00 USD")).toBeVisible()
  await expect(page.getByText(refundId).first()).toBeVisible()
  await expect(page.getByText(captureId).first()).toBeVisible()
})

test("E2E-02 partial refund of a price adjustment", async ({ page }) => {
  const captureId = await sandboxCheckout(page, "Bamboo bath mat")
  const caseId = await createCaseForCapture(page, captureId, {
    customer: "E2E Buyer",
    category: "Other",
    issue: "Price dropped right after purchase; asks for the difference",
    message:
      "Hi! I bought the bamboo bath mat for $42.00 a few minutes ago and now it's listed at $35.00. Could you refund the $7.00 difference? I'm keeping the mat.",
    requested: "7.00",
    notes:
      "Price check: the bamboo bath mat's listed price dropped from $42.00 to $35.00 today when our sale started, after this order was paid. The customer paid $42.00.",
  })
  await investigateUntilReady(page)

  const { result } = await approveInDialog(page)
  await expect(result).toContainText("Refund completed")
  const refundId = await refundIdIn(result.textContent())
  const refund = await paypalGet<{
    status: string
    amount: { value: string }
  }>(`/v2/payments/refunds/${refundId}`)
  expect(refund).toMatchObject({
    status: "COMPLETED",
    amount: { value: "7.00" },
  })

  const [attempt] = await refundAttempts(caseId)
  expect(attempt.approved_amount_minor).toBe(700)
  await page.goto(`/cases/${caseId}`)
  await expect(page.getByText("Partially refunded").first()).toBeVisible()
})

test("E2E-05 two rapid approvals execute one refund", async ({ page }) => {
  const captureId = await sandboxCheckout(page, "Linen napkins")
  const caseId = await createCaseForCapture(
    page,
    captureId,
    cancellation("24.00"),
  )
  const investigationId = await investigateUntilReady(page)

  const confirmation = {
    investigationId,
    amountMinor: 2400,
    currencyCode: "USD",
  }
  const path = `/api/cases/${caseId}/approve-and-refund`
  const responses = await Promise.all([
    postApi(page, path, confirmation),
    postApi(page, path, confirmation),
  ])
  const bodies = (await Promise.all(responses.map((r) => r.json()))) as {
    status: string
    code?: string
  }[]
  expect(bodies.map((b) => b.status).sort()).toEqual(["blocked", "completed"])
  expect(["in_progress", "already_refunded"]).toContain(
    bodies.find((b) => b.status === "blocked")!.code,
  )
  expect(await paypalRefundsForCapture(captureId)).toHaveLength(1)
  expect(await refundAttempts(caseId)).toHaveLength(1)
})

test("E2E-07 a PayPal decline, then a lost response reconciled once", async ({
  page,
}) => {
  const captureId = await sandboxCheckout(page, "Linen napkins")
  const caseId = await createCaseForCapture(
    page,
    captureId,
    cancellation("24.00"),
  )
  await investigateUntilReady(page)

  // PayPal declines (sandbox negative testing): nothing is refunded.
  const undoDecline = await withFault(
    page,
    "**/approve-and-refund",
    "paypal_refund_declined",
  )
  const declined = await approveInDialog(page)
  await undoDecline()
  await expect(declined.result).toContainText("Refund failed")
  await expect(declined.result).toContainText("doesn't have enough funds")
  await declined.dialog.getByRole("button", { name: "Close" }).click()
  expect(await caseStatus(caseId)).toBe("REFUND_FAILED")
  expect(await paypalRefundsForCapture(captureId)).toHaveLength(0)

  // After a new investigation, PayPal refunds but the answer is lost.
  await investigateUntilReady(page)
  const undoLost = await withFault(
    page,
    "**/approve-and-refund",
    "paypal_lost_response",
  )
  const lost = await approveInDialog(page)
  await undoLost()
  await expect(lost.result).toContainText("Status unknown")
  await lost.dialog.getByRole("button", { name: "Close" }).click()
  expect(await caseStatus(caseId)).toBe("RECOVERY_REQUIRED")
  await expect(
    page.getByRole("button", { name: "Approve and issue refund" }),
  ).toHaveCount(0)
  const atPayPal = await paypalRefundsForCapture(captureId)
  expect(atPayPal).toHaveLength(1)

  // Reconciliation replays the same request: PayPal returns the same refund.
  await page.getByRole("button", { name: "Check with PayPal" }).click()
  await expect(page.getByTestId("case-status")).toContainText("Refunded", {
    timeout: 60_000,
  })
  const attempts = await refundAttempts(caseId)
  expect(attempts.map((a) => a.status)).toEqual(["FAILED", "COMPLETED"])
  expect(attempts[1].paypal_refund_id).toBe(atPayPal[0].id)
  expect(await paypalRefundsForCapture(captureId)).toHaveLength(1)
})
