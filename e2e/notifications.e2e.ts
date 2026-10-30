import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { ADMIN_APP_URL } from "./playwright.config";
import { databaseUrl } from "./setup";
import { ADMIN, adminAppLogin, login, PASSWORD, run } from "./support";

// Notes from the team (#260): sent from the admin app, shown in the web app until read. Every
// user who exists sees one, so it's deleted right after these steps (and by the teardown).
test.describe.configure({ mode: "serial" });

const text = `E2E release ${run}\n\nSetlists are here: https://example.com/news.`;

test.afterAll(async () => {
  const sql = postgres(databaseUrl(), { prepare: false, onnotice: () => {} });
  try {
    await sql`delete from notifications where text = ${text}`;
  } finally {
    await sql.end();
  }
});

test("an admin writes it, previews it and sends it to all", async ({ page }) => {
  await adminAppLogin(page, ADMIN, PASSWORD);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto(`${ADMIN_APP_URL}/#/notifications`);
  await page.getByRole("button", { name: "Write a note" }).click();
  await page.getByLabel("Text").fill(text);
  await page.getByRole("button", { name: "Preview" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("The Coverband team")).toBeVisible();
  await expect(dialog.getByRole("link", { name: "https://example.com/news" })).toBeVisible();
  await dialog.getByRole("button", { name: "Send to all" }).click();
  await expect(page.getByText("Note sent to every user")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: `E2E release ${run}` })).toContainText(
    "0 of",
  );
});

test("a user sees it once, and only OK closes it", async ({ page }) => {
  await login(page, ADMIN, PASSWORD);
  const note = page.getByRole("alertdialog");
  await expect(note.getByRole("heading", { name: "The Coverband team" })).toBeVisible();
  await expect(note).toContainText(`E2E release ${run}`);
  await expect(note.getByRole("link", { name: "https://example.com/news" })).toHaveAttribute(
    "target",
    "_blank",
  );
  await page.keyboard.press("Escape");
  await expect(note).toBeVisible();
  await note.getByRole("button", { name: "OK" }).click();
  await expect(note).toBeHidden();
  // Opened again: the unread notes come back empty.
  const checked = page.waitForResponse((res) => res.url().endsWith("/api/notifications"));
  await page.reload();
  await checked;
  await expect(page.getByRole("alertdialog")).toBeHidden();
});

test("the admin app counts who read it", async ({ page }) => {
  await adminAppLogin(page, ADMIN, PASSWORD);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.goto(`${ADMIN_APP_URL}/#/notifications`);
  await expect(page.getByRole("row").filter({ hasText: `E2E release ${run}` })).toContainText(
    "1 of",
  );
});
