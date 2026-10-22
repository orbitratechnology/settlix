import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.E2E_PORT ?? 3000)
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`

/**
 * PRD §17.3 end-to-end suite (`bun run test:e2e`). Specs are `*.e2e.ts` so Bun's
 * unit runner never picks them up. Live specs (real PayPal Sandbox checkout and
 * refunds, real Claude) run only with E2E_LIVE=1. The dev server is started
 * with SETTLIX_TEST_FAULTS=1 so fault scenarios can be requested per call.
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.(e2e|setup)\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 4 * 60_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "auth", testMatch: /auth\.setup\.ts$/ },
    {
      name: "chromium",
      testMatch: /.*\.e2e\.ts$/,
      dependencies: ["auth"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "tests/e2e/.auth/e2e.json",
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `bun run dev --port ${port}`,
        url: `${baseURL}/login`,
        reuseExistingServer: true,
        timeout: 180_000,
        env: {
          SETTLIX_TEST_FAULTS: "1",
          // Cloud sessions keep the key under another name (see CLAUDE.md).
          ANTHROPIC_API_KEY:
            process.env.ANTHROPIC_API_KEY ??
            process.env.SETTLIX_ANTHROPIC_API_KEY ??
            "",
        },
      },
})
