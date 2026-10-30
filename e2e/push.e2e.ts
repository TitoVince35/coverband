import { createECDH, randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
import { FAKE_PUSH_PORT } from "./playwright.config";
import { databaseUrl } from "./setup";
import { ADMIN, login, PASSWORD } from "./support";

// Push notifications on a device (#261): turned on and off from the account page. The browser's
// push service is replaced by a subscription to the fake one (Chrome's would need Google).

/** The device's keys, real ones: the server encrypts with them (#262). */
const p256dh = createECDH("prime256v1").generateKeys().toString("base64url");
const auth = randomBytes(16).toString("base64url");

async function fakePushService(page: Page) {
  await page.context().grantPermissions(["notifications"]);
  await page.addInitScript(
    ({ port, p256dh, auth }) => {
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
