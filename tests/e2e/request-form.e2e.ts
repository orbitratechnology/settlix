import { expect, test } from "@playwright/test"

import {
  adminDb,
  createBuyerOrder,
  E2E_MERCHANT_ID,
  setStoreSettings,
} from "./workspace"

/**
 * Phase 9: the customer's side of a refund. A customer who isn't signed in
 * asks through the store's public form, the store asks for more on the
 * request page, and the customer answers on their private status page.
 * Claude's automatic check is off for these runs, so nothing here calls an
 * outside service.
 */
test.describe.configure({ mode: "serial" })

let previous: Awaited<ReturnType<typeof setStoreSettings>>

test.beforeAll(async () => {
  previous = await setStoreSettings(adminDb(), {
    request_form_enabled: true,
    auto_check_requests: false,
  })
})

test.afterAll(async () => {
  await setStoreSettings(adminDb(), previous)
})

test("E2E-09 customer asks through the form, the store asks for more, the customer replies", async ({
  page,
  browser,
}) => {
  const db = adminDb()
  const order = await createBuyerOrder(
    db,
    "Linen apron, charcoal (E2E fixture)",
  )
  const customer = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  })
  const c = await customer.newPage()

  await c.goto(`/r/settlix-e2e?order=${order.reference}&via=qr`)
  await expect(
    c.getByRole("heading", { name: "Ask for a refund" }),
  ).toBeVisible()
  await expect(c.getByLabel("Order number")).toHaveValue(order.reference)

  // A wrong email is refused without saying which part didn't match, and
  // nothing the customer wrote is lost.
  await c.getByLabel("Email you used for the order").fill("someone@example.com")
  await c.getByRole("radio", { name: "It arrived damaged or broken" }).click()
  const details = "The seam tore open on the first wash. I have a photo."
  await c.getByLabel("Tell us more").fill(details)
  await c.getByRole("button", { name: "Send request" }).click()
  await expect(c.getByText(/order number and email don.t match/)).toBeVisible()
  await expect(c.getByLabel("Tell us more")).toHaveValue(details)

  await c
    .getByLabel("Email you used for the order")
    .fill(order.email.toUpperCase())
  await c.getByRole("button", { name: "Send request" }).click()
  await c.waitForURL(/\/status\/[a-f0-9]{64}\?sent=1$/)
  await expect(
    c.getByRole("heading", { name: "We have your request" }),
  ).toBeVisible()
  await expect(c.getByText(/Request STX-\d+ sent/)).toBeVisible()
  const statusUrl = c.url().split("?")[0]

  const request = (
    await db
      .from("cases")
      .select(
        "id, case_number, channel, channel_source, customer_verified, status",
      )
      .eq("merchant_id", E2E_MERCHANT_ID)
      .eq("order_id", order.id)
      .single()
  ).data!
  expect(request).toMatchObject({
    channel: "form",
    channel_source: "qr",
    customer_verified: true,
    status: "NEW",
  })

  // The store sees where it came from and asks for the photo.
  await page.goto("/cases")
  await expect(
    page.getByRole("link", { name: new RegExp(order.name) }),
  ).toContainText("sent through your form")
  await page.goto(`/cases/${request.id}`)
  await expect(page.getByText("Your request form (QR code)")).toBeVisible()
  await expect(page.getByText(/email match this order/)).toBeVisible()
  await expect(
    page.getByRole("button", { name: "Post and open in email app" }),
  ).toBeVisible()

  await page.getByRole("button", { name: "More actions" }).click()
  await page
    .getByRole("menuitem", { name: "Ask the customer for more" })
    .click()
  const dialog = page.getByRole("dialog")
  const ask = "Hi, could you send a photo of the torn seam?"
  await dialog.getByLabel("Message to the customer").fill(ask)
  await expect(
    dialog.getByRole("checkbox", { name: /request page/ }),
  ).toBeChecked()
  await dialog.getByRole("button", { name: "Send" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId("case-status")).toContainText(
    "Waiting on customer",
  )
  await expect(page.getByText("You posted on their request page")).toBeVisible()

  // The customer sees the question on their page and answers there.
  await c.goto(statusUrl)
  await expect(
    c.getByRole("heading", {
      name: "The store needs a little more information",
    }),
  ).toBeVisible()
  await expect(c.getByText(ask)).toBeVisible()
  const answer = "Photo sent by email: the seam is open along 4 cm."
  await c.getByLabel("Reply to the store").fill(answer)
  await c.getByRole("button", { name: "Send to the store" }).click()
  await expect(c.getByText("Sent to Settlix E2E Store")).toBeVisible()
  await expect(c.getByText(answer)).toBeVisible()
  await customer.close()

  // The answer is part of the request for the store (and for Claude).
  await page.reload()
  await expect(page.getByText("Replied on their request page")).toBeVisible()
  const { data: updated } = await db
    .from("cases")
    .select("customer_message")
    .eq("id", request.id)
    .single()
  expect(updated?.customer_message).toContain(answer)
})

test("E2E-10 form link, QR code, printable card, and pausing the form", async ({
  page,
  browser,
}) => {
  await page.goto("/request-form")
  await expect(page.getByTestId("form-link")).toContainText("/r/settlix-e2e")
  await expect(
    page.getByRole("img", { name: /QR code that opens/ }),
  ).toBeVisible()

  const formSwitch = page.getByRole("switch", {
    name: "Take requests through the form",
  })
  await expect(formSwitch).toBeChecked()
  await formSwitch.click()
  await expect(page.getByText("Paused", { exact: true })).toBeVisible()

  const customer = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  })
  const c = await customer.newPage()
  await c.goto("/r/settlix-e2e")
  await expect(c.getByText("Not taking requests here right now")).toBeVisible()
  await c.goto(`/status/${"0".repeat(64)}`)
  await expect(c.getByText("Page not found")).toBeVisible()
  await customer.close()

  await formSwitch.click()
  await expect(page.getByText("Paused", { exact: true })).toHaveCount(0)

  await page.goto("/request-form/card")
  await expect(
    page.getByRole("heading", { name: "Something wrong with your order?" }),
  ).toBeVisible()
  await expect(page.getByText("settlix-e2e")).toBeVisible()
})
