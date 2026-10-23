import { expect, test } from "@playwright/test";
import { CONTACT_RECIPIENT } from "./playwright.config";
import { ADMIN, login, PASSWORD } from "./support";

/** The latest email sent to that address, as Mailpit has it (waits for it to arrive). */
async function latestEmail(to: string) {
  const mailpit = process.env.MAILPIT_URL;
  if (!mailpit) throw new Error("Set MAILPIT_URL (Mailpit's API, from docker-compose)");
  let email: { Subject: string; Text: string; ReplyTo: { Address: string }[] } | undefined;
  await expect
    .poll(async () => {
      const search = await fetch(
        `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
      );
      const { messages } = (await search.json()) as { messages: { ID: string }[] };
      const latest = messages[0];
      if (!latest) return undefined;
      email = await (await fetch(`${mailpit}/api/v1/message/${latest.ID}`)).json();
      return email?.Subject;
    })
    .toBeTruthy();
  return email;
}

test("a bug report reaches the team, replies going to the user (#234)", async ({ page }) => {
  await login(page, ADMIN, PASSWORD);
  await page.goto("/account");
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Contact us" }).click();
  await expect(page.getByText(`as E2E Admin (${ADMIN})`, { exact: false })).toBeVisible();

  // A subject is chosen: none by default.
  const message = page.getByLabel("Message");
  await message.fill("The setlist page crashes when I save.");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("alert")).toHaveText("Choose a subject.");
  await page.getByRole("combobox", { name: "Subject" }).click();
  await page.getByRole("option", { name: "Bug report" }).click();
  await expect(page.getByText("A bug report also sends the app's version")).toBeVisible();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Message sent. Thank you!")).toBeVisible();
  // Back where the user was.
  await expect(page).toHaveURL(/\/account$/);

  const email = await latestEmail(CONTACT_RECIPIENT);
  expect(email?.Subject).toBe("Coverband Beta: Bug report");
  expect(email?.ReplyTo.map((r) => r.Address)).toEqual([ADMIN]);
  expect(email?.Text).toContain("The setlist page crashes when I save.");
  expect(email?.Text).toContain("Page: /account");
});
