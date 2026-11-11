import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { newBand } from "./support";

// A user's own settings: their avatar, the colour theme.
test.describe.configure({ mode: "serial" });

let leader: Page;

test.beforeAll(async ({ browser }) => {
  leader = (await newBand(browser, "Account")).leader;
});

test.afterAll(async () => {
  await leader?.context().close();
});

test("the band leader uploads an avatar, then removes it", async () => {
  await leader.goto("/account");
  await leader
    .locator('input[type="file"]')
    .setInputFiles(fileURLToPath(new URL("./fixtures/photo.jpg", import.meta.url)));
  // Shown, not only there: the preview is a blob: image, which the security policy must allow.
  const preview = leader.getByRole("img", { name: "Preview of your new avatar" });
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512);
  await leader.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByText("Avatar updated.")).toBeVisible();

  // The photo is served (from object storage) and shows in the header.
  const photo = leader.locator('header img[src*="/avatar?v="]');
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512);

  await leader.getByRole("button", { name: "Remove" }).click();
  await expect(leader.getByText("Avatar removed.")).toBeVisible();
  await expect(leader.locator('img[src*="/avatar?v="]')).toHaveCount(0);
});

test("the colour theme switches and is remembered", async () => {
  const html = leader.locator("html");
  await expect(html).toHaveClass(/dark/);
  await leader.getByRole("button", { name: /theme/i }).click();
  await leader.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(html).not.toHaveClass(/dark/);
  await leader.reload();
  await expect(html).not.toHaveClass(/dark/);
});
