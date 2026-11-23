import { expect, type Page, test } from "@playwright/test";
import { type Band, dateIn, newBand } from "./support";

// Gigs (brief 034): create, list and edit a gig, with its venue (#326).
test.describe.configure({ mode: "serial" });

let band: Band;
let leader: Page;

test.beforeAll(async ({ browser }) => {
  band = await newBand(browser, "Gigs");
  leader = band.leader;
});

test.afterAll(async () => {
  await leader?.context().close();
});

test("a member creates a gig with a new venue, then one at that venue, and edits it (#326)", async () => {
  await leader.getByRole("link", { name: "Gigs" }).first().click();
  await expect(leader.getByText("No gig to come")).toBeVisible();
  await leader.getByRole("link", { name: "New gig" }).click();

  // Save says what's missing until a date and a title or a venue are there.
  const save = leader.getByRole("button", { name: "Save" });
  await expect(leader.getByText("Choose a date")).toBeVisible();
  await expect(save).toBeDisabled();
  await leader.getByLabel("Date").fill(dateIn(10));
  await expect(leader.getByText("Add a title or a venue")).toBeVisible();

  // A new venue, from what's typed in the venue box.
  await leader.getByRole("combobox").fill("Le Mondo Bizarro");
  await leader.getByRole("option", { name: "New venue “Le Mondo Bizarro”" }).click();
  await expect(leader.getByText("Add the venue's city")).toBeVisible();
  await leader.getByLabel("City").fill("Rennes");
  await leader.getByLabel(/^Address/).fill("264 avenue du Général Patton");
  await leader.getByLabel("Private event").check({ force: true });
  await save.click();

  // The compact view: status, type, venue, Directions.
  await expect(leader.getByRole("heading", { name: "Le Mondo Bizarro" })).toBeVisible();
  await expect(leader.getByText("Proposed")).toBeVisible();
  await expect(leader.getByText("Private event")).toBeVisible();
  await expect(leader.getByText("264 avenue du Général Patton, Rennes")).toBeVisible();
  await expect(leader.getByRole("link", { name: "Directions" })).toHaveAttribute(
    "href",
    /264%20avenue%20du%20G%C3%A9n%C3%A9ral%20Patton%2C%20Rennes/,
  );

  // A second gig at the band's venue, found by searching it.
  await leader.getByRole("link", { name: "Gigs" }).first().click();
  await leader.getByRole("link", { name: "New gig" }).click();
  await leader.getByLabel("Date").fill(dateIn(20));
  await leader.getByLabel("Title").fill("Release party");
  await leader.getByRole("combobox").fill("mondo");
  await leader.getByRole("option", { name: /Le Mondo Bizarro/ }).click();
  await expect(leader.getByText("The band's venue, used by 1 gig")).toBeVisible();
  await expect(leader.getByLabel("City")).toHaveValue("Rennes");
  await leader.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByRole("heading", { name: "Release party" })).toBeVisible();

  // Both in the next gigs, the soonest first.
  await leader.getByRole("link", { name: "Gigs" }).first().click();
  const gigs = leader.getByRole("list", { name: "Gigs" });
  await expect(gigs.getByRole("listitem")).toHaveCount(2);
  await expect(gigs.getByRole("listitem").first()).toContainText("Le Mondo Bizarro");
  await expect(gigs.getByRole("listitem").nth(1)).toContainText("Release party");

  // Edited: a new title and show time; the venue's change shows on both gigs.
  await gigs.getByRole("link", { name: /Release party/ }).click();
  await leader.getByRole("link", { name: "Edit" }).click();
  await leader.getByLabel("Title").fill("Release party, second night");
  await leader.getByLabel(/^Show time/).fill("21:30");
  await leader.getByLabel(/^Address/).fill("264 av. du Général Patton");
  await leader.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByRole("heading", { name: "Release party, second night" })).toBeVisible();
  await expect(leader.getByText("On stage 9:30 PM")).toBeVisible();
  await leader.getByRole("link", { name: "Gigs" }).first().click();
  await gigs.getByRole("link", { name: /^Le Mondo Bizarro/ }).click();
  await expect(leader.getByText("264 av. du Général Patton, Rennes")).toBeVisible();

  // The band's journal says who created it.
  await leader.getByRole("link", { name: "Home" }).first().click();
  await expect(
    leader.getByText("Lea Leader created the gig “Release party, second night”"),
  ).toBeVisible();
});
