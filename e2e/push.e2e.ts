import { createECDH, randomBytes } from "node:crypto";
import { expect, type Page, request, test } from "@playwright/test";
import postgres from "postgres";
import { ADMIN_APP_URL, FAKE_PUSH_PORT } from "./playwright.config";
import { databaseUrl } from "./setup";
import { ADMIN, adminAppLogin, login, PASSWORD, run } from "./support";

// Push notifications on a device (#261): turned on and off from the account page. The browser's
// push service is replaced by a subscription to the fake one (Chrome's would need Google).

/** The device's keys, real ones: the server encrypts with them (#262). */
const p256dh = createECDH("prime256v1").generateKeys().toString("base64url");
const auth = randomBytes(16).toString("base64url");

async function fakePushService(page: Page) {
  await page.context().grantPermissions(["notifications"]);
  await page.addInitScript(
    ({ port, p256dh, auth }) => {
      // Playwright's headless Chromium (CI) may lack the Push API: the page gets one, as Chrome's.
      if (!("Notification" in window)) {
        Object.defineProperty(window, "Notification", {
          value: class {
            static permission = "granted";
            static requestPermission = async () => "granted";
          },
        });
      }
      if (!("PushManager" in window)) {
        const FakePushManager = class {};
        Object.defineProperty(window, "PushManager", { value: FakePushManager });
        const manager = new FakePushManager();
        Object.defineProperty(ServiceWorkerRegistration.prototype, "pushManager", {
          get: () => manager,
        });
      }
      let current: PushSubscription | null = null;
      PushManager.prototype.getSubscription = async () => current;
      PushManager.prototype.subscribe = async () => {
        const endpoint = `https://localhost:${port}/push/${crypto.randomUUID()}`;
        current = {
          endpoint,
          toJSON: () => ({ endpoint, keys: { p256dh, auth } }),
          unsubscribe: async () => {
            current = null;
            return true;
          },
        } as unknown as PushSubscription;
        return current;
      };
    },
    { port: FAKE_PUSH_PORT, p256dh, auth },
  );
}

async function devicesOf(email: string) {
  const sql = postgres(databaseUrl(), { prepare: false, onnotice: () => {} });
  try {
    const rows = await sql`select s.endpoint from push_subscriptions s
      join users u on u.id = s.user_id where u.email = ${email}`;
    return rows.map((row) => row.endpoint as string);
  } finally {
    await sql.end();
  }
}

test("a user turns notifications on for this device, then off; logging out forgets it", async ({
  page,
}) => {
  await fakePushService(page);
  await login(page, ADMIN, PASSWORD);
  await page.goto("/account");
  // TEMPORARY diagnostic (CI only shows the card missing).
  console.log(
    "PUSH DIAGNOSTIC",
    JSON.stringify(
      await page.evaluate(async () => {
        const ready = await Promise.race([
          navigator.serviceWorker.ready.then((r) => `ready ${r.active?.state}`),
          new Promise((resolve) => setTimeout(() => resolve("not ready after 5 s"), 5000)),
        ]);
        const registrations = await navigator.serviceWorker.getRegistrations();
        return {
          ua: navigator.userAgent,
          pushManager: "PushManager" in window,
          notification: "Notification" in window && Notification.permission,
          ready,
          registrations: registrations.map((r) => [
            r.installing?.state,
            r.waiting?.state,
            r.active?.state,
          ]),
          controller: Boolean(navigator.serviceWorker.controller),
        };
      }),
    ),
  );
  await page.getByRole("button", { name: "Turn on notifications" }).click();
  await expect(page.getByText("Notifications are on for this device.")).toBeVisible();
  expect(await devicesOf(ADMIN)).toEqual([expect.stringContaining(`localhost:${FAKE_PUSH_PORT}`)]);

  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByRole("button", { name: "Turn on notifications" })).toBeVisible();
  expect(await devicesOf(ADMIN)).toEqual([]);

  // On again, then logging out: the next account on this device gets nothing of theirs.
  await page.getByRole("button", { name: "Turn on notifications" }).click();
  await expect(page.getByText("Notifications are on for this device.")).toBeVisible();
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await devicesOf(ADMIN)).toEqual([]);
});

test("a note from the team is pushed to the devices with notifications on (#262)", async ({
  page,
}) => {
  const text = `E2E push ${run}`;
  const sql = postgres(databaseUrl(), { prepare: false, onnotice: () => {} });
  try {
    await fakePushService(page);
    await login(page, ADMIN, PASSWORD);
    await page.goto("/account");
    await page.getByRole("button", { name: "Turn on notifications" }).click();
    await expect(page.getByText("Notifications are on for this device.")).toBeVisible();
    const [endpoint] = await devicesOf(ADMIN);
    const id = endpoint?.split("/").at(-1);

    await adminAppLogin(page, ADMIN, PASSWORD);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await page.goto(`${ADMIN_APP_URL}/#/notifications`);
    await page.getByRole("button", { name: "Write a note" }).click();
    await page.getByLabel("Text").fill(text);
    await page.getByRole("button", { name: "Preview" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Send to all" }).click();
    await expect(page.getByText(/Note sent to every user, pushed to \d+ devices?/)).toBeVisible();
    await expect(page.getByRole("row").filter({ hasText: text })).toContainText("device");

    // The fake push service got it: signed, encrypted, kept a day for an offline device.
    const fake = await request.newContext({ ignoreHTTPSErrors: true });
    const received = (await (
      await fake.get(`https://localhost:${FAKE_PUSH_PORT}/received`)
    ).json()) as { id: string; ttl: string; encoding: string; vapid: boolean }[];
    expect(received.filter((push) => push.id === id)).toEqual([
      { id, ttl: "86400", encoding: "aes128gcm", vapid: true },
    ]);
    await fake.dispose();
  } finally {
    // Every user would see the note, and this device would get the next ones.
    await sql`delete from notifications where text = ${text}`;
    await sql`delete from push_subscriptions where endpoint like ${`https://localhost:${FAKE_PUSH_PORT}/%`}`;
    await sql.end();
  }
});
