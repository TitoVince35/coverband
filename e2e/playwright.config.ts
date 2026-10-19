import { defineConfig, devices } from "@playwright/test";

/** Own port, so end-to-end runs never clash with `bun run dev` (3000 and 5173). */
export const E2E_PORT = 3100;
const baseURL = `http://localhost:${E2E_PORT}`;
const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.e2e.ts",
  // One server and one database: tests run in order, one at a time.
  workers: 1,
  // No retries: a serial story would start over with the same people and fail for another reason.
  retries: 0,
  forbidOnly: ci,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./setup.ts",
  globalTeardown: "./teardown.ts",
  use: {
    baseURL,
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [
    {
      // Mobile-first: a phone, in Chromium. Playwright's own Chromium doesn't install on
      // Ubuntu 26.04 yet: locally, the system Chrome.
      name: "phone",
      use: { ...devices["Pixel 7"], ...(ci ? {} : { channel: "chrome" }) },
    },
  ],
  // Production-like: the API serves the built web app (`bun run build` + `bun run serve`).
  webServer: {
    command: "bun run build && bun apps/api/src/main.ts",
    cwd: "..",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !ci,
    timeout: 180_000,
    env: { PORT: String(E2E_PORT), BETTER_AUTH_URL: baseURL, WEB_DIST_DIR: "apps/web/dist" },
  },
});
