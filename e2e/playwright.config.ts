import { defineConfig, devices } from "@playwright/test";

/** Own port, so end-to-end runs never clash with `bun run dev` (3000 and 5173). */
export const E2E_PORT = 3100;
const baseURL = `http://localhost:${E2E_PORT}`;
/** The fake LRCLIB the app searches lyrics on (`fake-lrclib.ts`). */
export const FAKE_LRCLIB_PORT = 3101;
/** A second server of the same build, with a beta access code (`access.e2e.ts`). */
export const GATED_PORT = 3102;
export const GATED_ACCESS_CODE = "e2e access code";
/** The fake music services "I feel lucky" searches (`fake-music.ts`: Deezer). */
export const FAKE_MUSIC_PORT = 3103;
const fakeMusic = `http://localhost:${FAKE_MUSIC_PORT}`;
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
  webServer: [
    {
      command: "bun run build && bun apps/api/src/main.ts",
      cwd: "..",
      url: `${baseURL}/api/health`,
      // Never reused: a server started otherwise would search the real LRCLIB and Deezer.
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        PORT: String(E2E_PORT),
        BETTER_AUTH_URL: baseURL,
        WEB_DIST_DIR: "apps/web/dist",
        LRCLIB_URL: `http://localhost:${FAKE_LRCLIB_PORT}`,
        DEEZER_URL: `${fakeMusic}/deezer`,
      },
    },
    // The same build behind the beta access code. Started with the first one, whose build is
    // done before any test runs.
    {
      command: "bun apps/api/src/main.ts",
      cwd: "..",
      url: `http://localhost:${GATED_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(GATED_PORT),
        BETTER_AUTH_URL: `http://localhost:${GATED_PORT}`,
        WEB_DIST_DIR: "apps/web/dist",
        BETA_ACCESS_CODE: GATED_ACCESS_CODE,
        LRCLIB_URL: `http://localhost:${FAKE_LRCLIB_PORT}`,
        DEEZER_URL: `${fakeMusic}/deezer`,
      },
    },
    // Lyrics searches never reach the real LRCLIB.
    {
      command: "bun fake-lrclib.ts",
      url: `http://localhost:${FAKE_LRCLIB_PORT}/health`,
      reuseExistingServer: !ci,
      env: { PORT: String(FAKE_LRCLIB_PORT) },
    },
    // Nor do "I feel lucky" searches reach the real Deezer.
    {
      command: "bun fake-music.ts",
      url: `${fakeMusic}/health`,
      reuseExistingServer: !ci,
      env: { PORT: String(FAKE_MUSIC_PORT) },
    },
  ],
});
