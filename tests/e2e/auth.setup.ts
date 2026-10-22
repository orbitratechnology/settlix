import { expect, test as setup } from "@playwright/test"

import { e2eAccount } from "./workspace"

/** Signs in through the real login form once and saves the session cookies. */
setup("sign in as the E2E merchant", async ({ page }) => {
  const account = e2eAccount()
  await page.goto("/login")
  await page.getByLabel("Email").fill(account.email)
  await page.getByLabel("Password").fill(account.password)
  await page.getByRole("button", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText("Settlix E2E Store").first()).toBeVisible()
  await page.context().storageState({ path: "tests/e2e/.auth/e2e.json" })
})
