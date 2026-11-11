import { type Browser, expect, type Page, request } from "@playwright/test";
import { ADMIN_APP_URL, BASE_URL } from "./playwright.config";

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

/** Logins are rate limited per client IP (3 per 10 s): each one comes from its own address. */
async function ownAddress(page: Page) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": randomAddress() });
}

const randomAddress = () => `10.${randomByte()}.${randomByte()}.${randomByte()}`;

export async function login(page: Page, address: string, password: string) {
  await ownAddress(page);
  await page.goto("/login");
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Fills in the admin app's login form (#246); what follows depends on who logs in. */
export async function adminAppLogin(page: Page, address: string, password: string) {
  await ownAddress(page);
  await page.goto(ADMIN_APP_URL);
  await page.getByLabel("Email").fill(address);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/**
 * Opens a row of an admin app list (#247): once its search has settled (the URL carries it), the
 * row's cell is clicked until the record's page opens (a list still refreshing drops the click).
 */
export async function openAdminRow(page: Page, text: string) {
  await expect(page).toHaveURL(/filter=/);
  await expect(async () => {
    await page.getByRole("row").filter({ hasText: text }).getByRole("cell", { name: text }).click();
    await expect(page).toHaveURL(/\/show$/, { timeout: 1000 });
  }).toPass();
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

/** A band of its own for a test file, with its band leader logged in on their own browser. */
export interface Band {
  name: string;
  slug: string;
  leader: Page;
  leaderEmail: string;
  /** The band leader's name, as the app shows it. */
  leaderName: string;
}

/**
 * Sets up a band for a test file, so files never share data and run in parallel: the run's admin
 * invites a band leader, who creates the band from the email's link. The same requests as the
 * admin app and the invitation wizard, without their screens (those are `onboarding.e2e.ts`).
 * `name` makes the band's name and the band leader's email unique in the run.
 */
export async function newBand(browser: Browser, name: string): Promise<Band> {
  const leaderEmail = email(`leader-${name.toLowerCase()}`);
  const admin = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { "x-forwarded-for": randomAddress() },
  });
  try {
    const signIn = await admin.post("/api/auth/sign-in/email", {
      data: { email: ADMIN, password: PASSWORD },
    });
    expect(signIn.ok()).toBe(true);
    const invite = await admin.post("/api/admin/invitations", {
      data: { email: leaderEmail, language: "en" },
    });
    expect(invite.ok()).toBe(true);
  } finally {
    await admin.dispose();
  }

  const token = (await invitationLink(leaderEmail)).split("/").at(-1);
  const leader = await (await browser.newContext()).newPage();
  await ownAddress(leader);
  const accepted = await leader.request.post(`/api/invitations/${token}/accept`, {
    data: {
      instrument: { code: "guitar" },
      bandName: bandName(name),
      newAccount: { firstName: "Lea", lastName: "Leader", password: PASSWORD },
    },
  });
  expect(accepted.ok()).toBe(true);
  const { bandSlug } = (await accepted.json()) as { bandSlug: string };
  await leader.goto(`/b/${bandSlug}`);
  await expect(leader.getByRole("heading", { name: bandName(name) })).toBeVisible();
  return { name: bandName(name), slug: bandSlug, leader, leaderEmail, leaderName: "Lea Leader" };
}

/** Adds a song to the band through the API (the screens that do it: `songs.e2e.ts`). */
export async function addSong(
  band: Band,
  song: { title: string; artist: string } & Record<string, unknown>,
): Promise<string> {
  const res = await band.leader.request.post(`/api/bands/${band.slug}/songs`, {
    data: { ...song, confirmDuplicate: true },
  });
  expect(res.ok()).toBe(true);
  return ((await res.json()) as { song: { id: string } }).song.id;
}

/**
 * Adds a setlist through the API (the screens that do it: `setlists.e2e.ts`): its parts in order,
 * each with an optional name and its songs' ids.
 */
export async function addSetlist(
  band: Band,
  title: string,
  parts: { name?: string; songs: string[] }[],
): Promise<void> {
  const api = `/api/bands/${band.slug}/setlists`;
  const created = await band.leader.request.post(api, { data: { title } });
  expect(created.ok()).toBe(true);
  const { setlist } = (await created.json()) as { setlist: { id: string; version: number } };
  const saved = await band.leader.request.put(`${api}/${setlist.id}/content`, {
    data: { version: setlist.version, parts: parts.map((part) => ({ name: null, ...part })) },
  });
  expect(saved.ok()).toBe(true);
}

/** How many items of a store the app saved on the device for offline use (#178, #240). */
export function savedCount(page: Page, name: "logos" | "documents") {
  return page.evaluate(
    (name) =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open("coverband");
        // Never create the app's database before the app does.
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(name)) return resolve(0);
          const count = db.transaction(name).objectStore(name).count();
          count.onsuccess = () => resolve(count.result);
          count.onerror = () => resolve(0);
        };
        open.onerror = () => resolve(0);
      }),
    name,
  );
}

/** The data the app saved on the device for offline use (#165), as JSON, or "" before any. */
export function savedCopy(page: Page) {
  return page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const open = indexedDB.open("coverband");
        // Never create the app's database before the app does.
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains("query-cache")) return resolve("");
          const get = db.transaction("query-cache").objectStore("query-cache").get("client");
          get.onsuccess = () => resolve(JSON.stringify(get.result ?? ""));
          get.onerror = () => resolve("");
        };
        open.onerror = () => resolve("");
      }),
  );
}
