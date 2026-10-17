import { expect, type Page } from "@playwright/test";

/**
 * Everything an end-to-end test creates is marked, so the teardown can remove it (and leftovers
 * of an interrupted run): emails at `@e2e.localhost`, band names starting with "E2E ".
 */
export const E2E_DOMAIN = "e2e.localhost";
// Set once by the runner (global setup), then inherited by the test workers.
process.env.E2E_RUN ??= crypto.randomUUID().slice(0, 8);
export const run = process.env.E2E_RUN;
export const email = (name: string) => `${name}-${run}@${E2E_DOMAIN}`;
export const bandName = (name: string) => `E2E ${name} ${run}`;
export const PASSWORD = "e2e correct horse battery";

/** This run's admin, created by the global setup (password: PASSWORD). */
export const ADMIN = email("admin");

export async function login(page: Page, address: string, password: string) {
  // Logins are rate limited per client IP (3 per 10 s): each one comes from its own address.
  const ip = `10.${randomByte()}.${randomByte()}.${randomByte()}`;
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": ip });
  await page.goto("/login");
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

const mailpit = () => {
  const url = process.env.MAILPIT_URL;
  if (!url) throw new Error("Set MAILPIT_URL (Mailpit's API, from docker-compose)");
  return url;
};

/** The invitation link in the latest email sent to that address (waits for it to arrive). */
export async function invitationLink(to: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(async () => {
      const search = await fetch(
        `${mailpit()}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
      );
      const { messages } = (await search.json()) as { messages: { ID: string }[] };
      const latest = messages[0];
      if (!latest) return undefined;
      const message = await fetch(`${mailpit()}/api/v1/message/${latest.ID}`);
      const { Text } = (await message.json()) as { Text: string };
      link = /https?:\/\/\S+\/invite\/[\w-]+/.exec(Text)?.[0];
      return link;
    })
    .toBeTruthy();
  // The email's link points to the server's public URL: keep only the path for this run.
  return new URL(link ?? "").pathname;
}

const randomByte = () => crypto.getRandomValues(new Uint8Array(1))[0] ?? 0;
