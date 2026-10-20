import { expect, test } from "@playwright/test";

test("search engines are asked to stay out", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Disallow: /");

  const page = await request.get("/login");
  expect(page.headers()["x-robots-tag"]).toBe("noindex, nofollow");
});
