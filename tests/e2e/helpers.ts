import { expect, type Page } from "@playwright/test"

import { adminDb } from "./workspace"

/** Live specs need the real PayPal Sandbox and Claude; opt in with E2E_LIVE=1. */
export const live = process.env.E2E_LIVE === "1"
export const LIVE_SKIP_REASON =
  "Live flow (PayPal Sandbox + Claude): run with E2E_LIVE=1"

export type Fault =
  | "ai_timeout"
  | "ai_invalid_output"
  | "paypal_lost_response"
  | "paypal_refund_declined"

/** Adds the test-fault header to every matching request until undone. */
export async function withFault(page: Page, urlGlob: string, fault: Fault) {
  const handler = (route: Parameters<Parameters<Page["route"]>[1]>[0]) =>
    route.continue({
      headers: { ...route.request().headers(), "x-settlix-test-fault": fault },
    })
  await page.route(urlGlob, handler)
  return () => page.unroute(urlGlob, handler)
}

/** A same-origin JSON POST with the page's session cookies. */
export async function postApi(
  page: Page,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const origin = new URL(page.url()).origin
  return page.request.post(`${origin}${path}`, {
    headers: { origin, "content-type": "application/json", ...headers },
    data: body ?? {},
    failOnStatusCode: false,
  })
}

/**
 * A real PayPal Sandbox checkout through the JS SDK popup, approved by the
 * sandbox buyer from PAYPAL_SANDBOX_BUYER_EMAIL / _PASSWORD. Returns the
 * capture ID Settlix stored.
 */
export async function sandboxCheckout(page: Page, itemName: string) {
  const email = process.env.PAYPAL_SANDBOX_BUYER_EMAIL
  const password = process.env.PAYPAL_SANDBOX_BUYER_PASSWORD
  if (!email || !password) {
    throw new Error(
      "Set PAYPAL_SANDBOX_BUYER_EMAIL and PAYPAL_SANDBOX_BUYER_PASSWORD",
    )
  }

  await page.goto("/payments")
  await page.getByRole("radio", { name: new RegExp(itemName) }).check()
  const payButton = page.getByRole("button", { name: "Pay with PayPal" })
  await expect(payButton).toBeVisible()
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    payButton.click(),
  ])

  // PayPal serves more than one checkout layout ("Complete Purchase" or "Pay").
  const complete = popup.getByRole("button", {
    name: /^(Complete Purchase|Pay|Pay Now)$/,
  })
  const emailBox = popup.getByRole("textbox", {
    name: "Email or mobile number",
  })
  await expect(complete.or(emailBox)).toBeVisible({ timeout: 60_000 })
  if (await emailBox.isVisible()) {
    await emailBox.fill(email)
    const next = popup.getByRole("button", { name: "Next" })
    if (await next.isVisible()) await next.click()
    const passwordBox = popup.getByRole("textbox", { name: "Password" })
    await expect(passwordBox).toBeVisible()
    await passwordBox.fill(password)
    await passwordBox.press("Enter")
  }
  await expect(complete).toBeVisible({ timeout: 60_000 })
  // A card funds instantly; the bank account can leave the capture pending.
  const card = popup.getByRole("radio", { name: /Visa/ })
  if (await card.isVisible()) await card.check({ force: true })
  await complete.click()
  await popup.waitForEvent("close", { timeout: 60_000 })

  // The checkout notice, not the "Last activity" line that repeats it.
  const notice = page.getByText(
    /PayPal confirmed the payment \(reference \S+\)\. Turn it into/,
  )
  await expect(notice).toBeVisible({ timeout: 60_000 })
  const captureId = (await notice.textContent())!.match(/reference (\S+)\)/)![1]
  return captureId
}

export type CaseInput = {
  customer: string
  category: string
  issue: string
  message: string
  requested: string
  notes: string
}

/** Opens a case for a captured payment through the Payments dialog. */
export async function createCaseForCapture(
  page: Page,
  captureId: string,
  input: CaseInput,
) {
  await page.goto("/payments")
  const row = page.getByRole("row").filter({ hasText: captureId })
  await row.getByRole("button", { name: "Create request" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Customer name").fill(input.customer)
  await dialog.getByRole("combobox", { name: "Reason" }).click()
  await page.getByRole("option", { name: input.category }).click()
  await dialog.getByLabel("Problem").fill(input.issue)
  await dialog.getByLabel("Customer message").fill(input.message)
  await dialog.getByLabel("Amount asked for (optional)").fill(input.requested)
  await dialog.getByLabel("Your notes (optional)").fill(input.notes)
  await dialog.getByRole("button", { name: "Create request" }).click()
  await expect(page).toHaveURL(/\/cases\/[0-9a-f-]{36}$/)
  return page.url().split("/").pop()!
}

/** Runs (or re-runs) the investigation and waits for the case to update. */
export async function investigate(page: Page) {
  const button = page.getByRole("button", {
    name: /^(Check this request|Check again)$/,
  })
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) =>
        r.url().endsWith("/investigate") && r.request().method() === "POST",
      { timeout: 120_000 },
    ),
    button.click(),
  ])
  await expect(button).toBeEnabled({ timeout: 30_000 })
  return response
}

export async function caseStatus(caseId: string) {
  const { data } = await adminDb()
    .from("cases")
    .select("status")
    .eq("id", caseId)
    .single()
  return data?.status
}

export async function refundAttempts(caseId: string) {
  const { data } = await adminDb()
    .from("refund_attempts")
    .select(
      "id, status, paypal_refund_id, approved_amount_minor, idempotency_key",
    )
    .eq("case_id", caseId)
    .order("created_at")
  return data ?? []
}

async function paypalToken() {
  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64")
  const response = await fetch(
    "https://api-m.sandbox.paypal.com/v1/oauth2/token",
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
  )
  if (!response.ok) throw new Error(`PayPal token ${response.status}`)
  return ((await response.json()) as { access_token: string }).access_token
}

/** Reads PayPal's own record (sandbox) to confirm what Settlix shows. */
export async function paypalGet<T>(path: string): Promise<T> {
  const response = await fetch(`https://api-m.sandbox.paypal.com${path}`, {
    headers: { Authorization: `Bearer ${await paypalToken()}` },
  })
  if (!response.ok) throw new Error(`PayPal GET ${path} → ${response.status}`)
  return (await response.json()) as T
}

/** Every refund PayPal holds for the order behind a capture. */
export async function paypalRefundsForCapture(captureId: string) {
  const { data: order } = await adminDb()
    .from("orders")
    .select("paypal_order_id")
    .eq("paypal_capture_id", captureId)
    .single()
  const paypalOrder = await paypalGet<{
    purchase_units: {
      payments?: {
        refunds?: {
          id: string
          status: string
          amount: { value: string; currency_code: string }
        }[]
      }
    }[]
  }>(`/v2/checkout/orders/${order!.paypal_order_id}`)
  return paypalOrder.purchase_units.flatMap(
    (unit) => unit.payments?.refunds ?? [],
  )
}
