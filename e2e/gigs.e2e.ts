import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";
import { addGig, addSetlist, addSong, type Band, dateIn, newBand } from "./support";

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
  await leader.getByLabel("Date", { exact: true }).fill(dateIn(10));
  await expect(leader.getByText("Add a title or a venue")).toBeVisible();

  // A new venue, from what's typed in the venue box.
  await leader.getByRole("combobox", { name: "Venue" }).fill("Le Mondo Bizarro");
  await leader.getByRole("option", { name: "New venue “Le Mondo Bizarro”" }).click();
  await expect(leader.getByText("Add the venue's city")).toBeVisible();
  await leader.getByLabel("City").fill("Rennes");
  await leader.getByLabel(/^Address/).fill("264 avenue du Général Patton");
  await leader.getByLabel("Private", { exact: true }).check({ force: true });
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
  await leader.getByLabel("Date", { exact: true }).fill(dateIn(20));
  await leader.getByLabel("Title", { exact: true }).fill("Release party");
  await leader.getByRole("combobox", { name: "Venue" }).fill("mondo");
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
  await leader.getByLabel("Title", { exact: true }).fill("Release party, second night");
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

test("its creator settles, postpones, cancels and deletes a gig (#327)", async () => {
  await leader.goto(`/b/${band.slug}/gigs/new`);
  await leader.getByLabel("Date", { exact: true }).fill(dateIn(30));
  await leader.getByLabel("Title", { exact: true }).fill("Wedding: Claire & Tom");
  // Settled through the form's status switch.
  await leader.getByRole("switch", { name: /Settled/ }).check();
  await leader.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByRole("heading", { name: "Wedding: Claire & Tom" })).toBeVisible();
  await expect(leader.getByText("Settled", { exact: true })).toBeVisible();

  // Settled: the date and title are fixed in the form; Postpone brings it back on the date.
  await leader.getByRole("link", { name: "Edit" }).click();
  await expect(leader.getByLabel("Date", { exact: true })).toBeHidden();
  await expect(leader.getByText("Fixed while settled.")).toBeVisible();
  await leader.getByRole("button", { name: "Postpone" }).click();
  await expect(leader.getByLabel("Date", { exact: true })).toBeFocused();
  await leader.getByLabel("Date", { exact: true }).fill(dateIn(31));
  await leader.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByText("Proposed", { exact: true })).toBeVisible();

  // Cancelled with its reason: read-only, the reason at its top.
  await leader.getByRole("button", { name: "Actions for Wedding: Claire & Tom" }).click();
  await leader.getByRole("menuitem", { name: /Cancel the gig/ }).click();
  const dialog = leader.getByRole("alertdialog");
  await expect(dialog.getByRole("button", { name: "Cancel the gig" })).toBeDisabled();
  await dialog.getByLabel("Reason").fill("The couple postponed the wedding to next summer.");
  await dialog.getByRole("button", { name: "Cancel the gig" }).click();
  await expect(leader.getByText(/^Cancelled by Lea Leader on /)).toBeVisible();
  await expect(leader.getByText("The couple postponed the wedding to next summer.")).toBeVisible();
  await expect(leader.getByRole("link", { name: "Edit" })).toBeHidden();

  // Crossed out in the list, then deleted from its menu there.
  await leader.getByRole("link", { name: "Gigs" }).first().click();
  const gigs = leader.getByRole("list", { name: "Gigs" });
  await expect(gigs.getByText("Wedding: Claire & Tom")).toHaveClass(/line-through/);
  await gigs.getByRole("button", { name: "Actions for Wedding: Claire & Tom" }).click();
  await leader.getByRole("menuitem", { name: "Delete" }).click();
  await leader.getByRole("alertdialog").getByRole("button", { name: "Delete the gig" }).click();
  await expect(gigs.getByText("Wedding: Claire & Tom")).toBeHidden();

  // The journal tells each step.
  await leader.getByRole("link", { name: "Home" }).first().click();
  await expect(leader.getByText("Lea Leader cancelled a gig")).toBeVisible();
  await expect(leader.getByText("Lea Leader deleted a gig")).toBeVisible();
});

test("a gig with its setlist, program and extra info, then Live (#328, #358)", async () => {
  const song = await addSong(band, {
    title: "Hey Joe",
    artist: "Jimi Hendrix",
    standardDuration: 210,
    status: "ready",
  });
  await addSetlist(band, "Summer set", [{ songs: [song] }]);
  const { setlists } = (await (
    await leader.request.get(`/api/bands/${band.slug}/setlists`)
  ).json()) as {
    setlists: { id: string; title: string }[];
  };
  const summer = setlists.find((setlist) => setlist.title === "Summer set")?.id ?? "";
  const date = dateIn(40);
  await leader.goto(`/b/${band.slug}/gigs/new`);
  // Its setlist is named after the gig: nothing to choose before it has a name.
  const setlistSelect = leader.getByRole("combobox", { name: "Setlist" });
  await expect(setlistSelect).toBeDisabled();
  await leader.getByLabel("Date", { exact: true }).fill(date);
  await leader.getByLabel("Title", { exact: true }).fill("Rock night #12");

  // A copy of the band's setlist, made when the gig is saved, named after it.
  await setlistSelect.selectOption(summer);
  await expect(leader.getByText(`named after it: “Rock night #12 · ${date}”`)).toBeVisible();

  // Program and extra info.
  await leader.getByRole("button", { name: "Add a link" }).click();
  await leader.getByLabel("Web address").fill("example.com/rock-night");
  await leader.getByLabel("Link title").fill("Facebook event");
  await leader.getByRole("button", { name: "Add", exact: true }).click();
  await leader.getByLabel("Running order, occasion").fill("20:00 The Lunatics, 21:15 us");
  await leader.getByLabel("Get in").fill("18:30");
  await leader.getByLabel("Soundcheck").fill("19:15");
  await leader.getByLabel("Pay (€)").fill("abc");
  await expect(leader.getByText("Check the pay: an amount in euros")).toBeVisible();
  await leader.getByLabel("Pay (€)").fill("400");
  await leader.getByLabel(/^About the pay/).fill("cash on the night");
  await leader.getByLabel("Shared backline").check();
  await leader.getByLabel("What the shared backline has").fill("Drum kit\nBass amp");
  await leader.getByLabel("Technicians provided").check();
  await leader.getByLabel("Notes").fill("Parking behind the bar");
  await leader.getByRole("button", { name: "Save" }).click();

  // The compact view: times, setlist, program, good to know.
  await expect(leader.getByRole("heading", { name: "Rock night #12" })).toBeVisible();
  await expect(leader.getByText("Get in 6:30 PM · Soundcheck 7:15 PM")).toBeVisible();
  // Headed "Setlist", its own title being the gig's name (#357); one part: no number of parts.
  const setlistCard = leader.getByRole("link", { name: /^Setlist \d/ });
  await expect(setlistCard).toContainText("1 song");
  await expect(setlistCard).not.toContainText("part");
  await expect(leader.getByRole("link", { name: "Facebook event" })).toHaveAttribute(
    "href",
    "https://example.com/rock-night",
  );
  await expect(leader.getByText("20:00 The Lunatics, 21:15 us")).toBeVisible();
  await expect(leader.getByText("€400 · cash on the night")).toBeVisible();
  // The shared backline on its own lines, as typed.
  const backline = leader.getByText("Drum kit Bass amp");
  await expect(backline).toBeVisible();
  expect(await backline.innerText()).toBe("Drum kit\nBass amp");
  await expect(leader.getByText("Technicians provided")).toBeVisible();
  await expect(leader.getByText("Parking behind the bar")).toBeVisible();

  // The gig's own setlist, named after it: never renamed by hand, marked on the setlists page.
  const gigPage = leader.url();
  await setlistCard.click();
  await expect(leader.getByRole("heading", { name: `Rock night #12 · ${date}` })).toBeVisible();
  await expect(
    leader.getByRole("link", { name: "Named after its gig: view the gig" }),
  ).toBeVisible();
  await leader.getByRole("button", { name: /^Actions for Rock night/ }).click();
  await expect(leader.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(leader.getByRole("menuitem", { name: "Rename" })).toHaveCount(0);
  await leader.keyboard.press("Escape");
  await leader.goto(`/b/${band.slug}/setlists`);
  const list = leader.getByRole("list", { name: "Setlists" });
  await expect(
    list
      .getByRole("listitem")
      .filter({ hasText: "Rock night #12" })
      .getByRole("img", { name: "For a gig" }),
  ).toBeVisible();
  await expect(
    list
      .getByRole("listitem")
      .filter({ hasText: "Summer set" })
      .getByRole("img", { name: "For a gig" }),
  ).toHaveCount(0);

  // Live opens the setlist's live mode.
  await leader.goto(gigPage);
  await leader.getByRole("link", { name: "Live" }).click();
  await expect(leader).toHaveURL(/\/setlists\/[^/]+\/live$/);
  await expect(leader.getByText("Hey Joe")).toBeVisible();
});

test("a contact added to the venue appears on the next gig there (#329)", async () => {
  await leader.goto(`/b/${band.slug}/gigs/new`);
  await leader.getByLabel("Date", { exact: true }).fill(dateIn(50));
  await leader.getByRole("combobox", { name: "Venue" }).fill("La Péniche");
  await leader.getByRole("option", { name: "New venue “La Péniche”" }).click();
  await leader.getByLabel("City").fill("Rennes");

  // Added to the venue, from the gig's contact dialog.
  await leader.getByRole("button", { name: "Add contact" }).click();
  const dialog = leader.getByRole("dialog");
  await dialog.getByText("Organizer", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "Name" }).fill("Yann Le Goff");
  await dialog.getByLabel("Phone").fill("06 12 34 56 78");
  await dialog.getByLabel("Email").fill("yann@example.com");
  await dialog.getByLabel("Also a contact of the venue").check();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(leader.getByText("From the venue (La Péniche)")).toBeVisible();

  // One of the gig's own.
  await leader.getByRole("button", { name: "Add contact" }).click();
  await dialog.getByText("Technical", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "Name" }).fill("Nico");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(leader.getByText("This gig")).toBeVisible();
  await leader.getByRole("button", { name: "Save" }).click();

  // The compact view: Call and Email.
  await expect(leader.getByRole("link", { name: "Call Yann Le Goff" })).toHaveAttribute(
    "href",
    "tel:0612345678",
  );
  await expect(leader.getByRole("link", { name: "Email Yann Le Goff" })).toHaveAttribute(
    "href",
    "mailto:yann@example.com",
  );
  await expect(leader.getByText("Nico")).toBeVisible();

  // The next gig at the venue lists the venue's contact, not the other gig's.
  await leader.goto(`/b/${band.slug}/gigs/new`);
  await leader.getByLabel("Date", { exact: true }).fill(dateIn(60));
  await leader.getByRole("combobox", { name: "Venue" }).fill("peniche");
  await leader.getByRole("option", { name: /La Péniche/ }).click();
  await expect(leader.getByText("From the venue (La Péniche)")).toBeVisible();
  await expect(leader.getByRole("button", { name: /Yann Le Goff/ })).toBeVisible();
  // The band's contacts are suggested by name.
  await leader.getByRole("button", { name: "Add contact" }).click();
  await dialog.getByRole("combobox", { name: "Name" }).fill("ni");
  await dialog.getByRole("option", { name: /Nico/ }).click();
  await expect(dialog.getByText(/One of the band's contacts/)).toBeVisible();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await leader.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByRole("link", { name: "Call Yann Le Goff" })).toBeVisible();
  await expect(leader.getByText("Nico")).toBeVisible();
});

test("a poster added, viewed, downloaded and removed (#330)", async () => {
  const gigId = await addGig(band, { date: dateIn(70), title: "Poster night" });
  await leader.goto(`/b/${band.slug}/gigs/${gigId}/edit`);
  await expect(leader.getByText("0 of 5 · 5 MB at most")).toBeVisible();
  await leader
    .locator("input[type=file]")
    .setInputFiles(fileURLToPath(new URL("./fixtures/photo.jpg", import.meta.url)));
  const dialog = leader.getByRole("dialog");
  await expect(dialog.getByLabel("Title")).toHaveValue("photo");
  await dialog.getByLabel("Title").fill("Saturday flyer");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(leader.getByText("1 of 5 · 5 MB at most")).toBeVisible();

  // The compact view: opened full screen, downloaded.
  await leader.getByRole("link", { name: "Gigs" }).first().click();
  await leader.goto(`/b/${band.slug}/gigs/${gigId}`);
  await leader.getByRole("button", { name: "Open the poster Saturday flyer" }).click();
  await expect(leader.getByRole("dialog").getByRole("img")).toBeVisible();
  await leader.getByRole("button", { name: "Close" }).click();
  const download = leader.waitForEvent("download");
  await leader.getByRole("link", { name: "Download Saturday flyer" }).click();
  expect((await download).suggestedFilename()).toMatch(/^Saturday flyer\.(webp|jpg)$/);

  // Removed, confirmed, from the form.
  await leader.goto(`/b/${band.slug}/gigs/${gigId}/edit`);
  await leader.getByRole("button", { name: "Remove the poster Saturday flyer" }).click();
  await leader.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(leader.getByText("0 of 5 · 5 MB at most")).toBeVisible();
});

test("the band home shows today's gig and the upcoming ones (#331)", async ({ browser }) => {
  const home = await newBand(browser, "GigHome");
  const page = home.leader;
  try {
    // Nothing yet: no cards.
    await expect(page.getByText("Today's gig")).toBeHidden();
    const today = await addGig(home, {
      date: dateIn(0),
      title: "Tonight at Le Ty Anna",
      getInTime: "18:30",
      soundcheckTime: "19:00",
      showTime: "21:00",
      venue: { name: "Le Ty Anna", city: "Rennes" },
    });
    for (const [days, title] of [
      [3, "Wedding"],
      [10, "Festival"],
      [20, "Studio day"],
    ] as const) {
      await addGig(home, { date: dateIn(days), title });
    }
    const cancelled = await addGig(home, { date: dateIn(5), title: "Called off" });
    await page.request.post(`/api/bands/${home.slug}/gigs/${cancelled}/cancel`, {
      data: { reason: "Rain" },
    });
    await page.reload();

    const card = page.getByRole("region", { name: "Today's gig" });
    await expect(card).toContainText("Tonight at Le Ty Anna");
    await expect(card).toContainText(
      "Rennes · Get in 6:30 PM · Soundcheck 7:00 PM · On stage 9:00 PM",
    );
    await card.getByRole("link", { name: "View the gig" }).click();
    await expect(page).toHaveURL(new RegExp(`/gigs/${today}$`));
    await page.getByRole("link", { name: "Home" }).first().click();

    // Upcoming: the cancelled one left out, the soonest first.
    await expect(page.getByText("3 upcoming gigs")).toBeVisible();
    const upcoming = page.getByRole("list", { name: "Upcoming gigs" });
    await expect(upcoming.getByRole("listitem")).toHaveCount(3);
    await expect(upcoming.getByRole("listitem").first()).toContainText("Wedding");
    // The overview's gigs to come, a link to the gigs page.
    const toCome = page.getByRole("link", { name: /Gigs to come/ });
    await expect(toCome).toContainText("4");
    await toCome.click();
    await expect(page.getByRole("heading", { name: "Gigs" })).toBeVisible();
  } finally {
    await page.context().close();
  }
});

test("the venue on a map, its pin dragged to correct it (#333)", async () => {
  // OpenStreetMap's tiles never reached: a blank tile instead. Removed after: the next tests share
  // this page, and an interception left on it can stall a reload's scripts (the service worker).
  await leader.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ contentType: "image/png", body: Buffer.alloc(0) }),
  );
  try {
    await leader.goto(`/b/${band.slug}/gigs/new`);
    await leader.getByLabel("Date", { exact: true }).fill(dateIn(80));
    await leader.getByRole("combobox", { name: "Venue" }).fill("Le Ty Anna");
    await leader.getByRole("option", { name: "New venue “Le Ty Anna”" }).click();
    await leader.getByLabel("City").fill("Rennes");
    await leader.getByLabel(/^Address/).fill("19 place Sainte-Anne");
    await expect(leader.getByText("The map shows once the venue is saved")).toBeVisible();
    await leader.getByRole("button", { name: "Save" }).click();

    // Found from the address by the API: the compact view shows it, credited.
    const map = leader.getByRole("img", { name: "Map: Le Ty Anna, 19 place Sainte-Anne, Rennes" });
    await expect(map).toBeVisible();
    await expect(map.getByRole("link", { name: "© OpenStreetMap" })).toBeVisible();
    const tiles = map.locator("img");
    await expect(tiles.first()).toHaveAttribute("src", /^https:\/\/tile\.openstreetmap\.org\/16\//);

    // In the form, the pin is dragged (here, with the keyboard): kept once saved.
    await leader.getByRole("link", { name: "Edit" }).click();
    const pin = leader.getByRole("button", { name: /The venue's pin/ });
    await expect(pin).toBeVisible();
    const before = await tiles.first().getAttribute("src");
    for (let i = 0; i < 40; i++) await pin.press("ArrowRight");
    await expect.poll(() => tiles.first().getAttribute("src")).not.toBe(before);
    await leader.getByRole("button", { name: "Save" }).click();
    await expect(leader).toHaveURL(/\/gigs\/[0-9a-f-]+$/);
    await expect(map).toBeVisible();
    const gigId = new URL(leader.url()).pathname.split("/").at(-1);
    const saved = (await (
      await leader.request.get(`/api/bands/${band.slug}/gigs/${gigId}`)
    ).json()) as {
      gig: { venue: { longitude: number } };
    };
    expect(saved.gig.venue.longitude).toBeGreaterThan(-1.6801);

    // An address the geocoder doesn't find: no map, Directions stays.
    await leader.goto(`/b/${band.slug}/gigs/new`);
    await leader.getByLabel("Date", { exact: true }).fill(dateIn(81));
    await leader.getByRole("combobox", { name: "Venue" }).fill("Nowhere club");
    await leader.getByRole("option", { name: "New venue “Nowhere club”" }).click();
    await leader.getByLabel("City").fill("Rennes");
    await leader.getByLabel(/^Address/).fill("1 rue de Nulle Part");
    await leader.getByRole("button", { name: "Save" }).click();
    await expect(leader.getByRole("link", { name: "Directions" })).toBeVisible();
    await expect(leader.getByRole("img", { name: /^Map:/ })).toHaveCount(0);
  } finally {
    await leader.unrouteAll({ behavior: "ignoreErrors" });
  }
});

test("the band's venues and contacts: a duplicate merged, another deleted (#334)", async () => {
  const api = `/api/bands/${band.slug}`;
  const contact = async (data: Record<string, unknown>) => {
    const res = await leader.request.post(`${api}/contacts`, { data });
    return ((await res.json()) as { contact: { id: string } }).contact.id;
  };
  const marc = await contact({ name: "Marc", type: "organizer", email: "marc@example.com" });
  const twin = await contact({ name: "Marc Dubois", type: "organizer", phone: "06 99 88 77 66" });
  await contact({ name: "Claire Martin", type: "organizer", phone: "07 11 22 33 44" });
  await addGig(band, { date: dateIn(90), title: "Merge night", contactIds: [marc, twin] });

  // The contacts page, from the band's menu.
  await leader.goto(`/b/${band.slug}`);
  await leader.getByRole("button", { name: "Band menu" }).click();
  await leader.getByRole("menuitem", { name: "Contacts" }).click();
  const list = leader.getByRole("list", { name: "Contacts" });
  await expect(list.getByText("Claire Martin")).toBeVisible();

  // Merged: the twin's phone kept with Marc's email, one contact left on the gig.
  await list.getByRole("button", { name: "Actions for Marc", exact: true }).click();
  await leader.getByRole("menuitem", { name: "Merge with…" }).click();
  const dialog = leader.getByRole("dialog");
  // The likely same person is chosen already.
  await expect(dialog.getByLabel("The other contact")).toHaveValue(twin);
  await dialog.getByText("Marc Dubois", { exact: true }).click();
  await dialog.getByRole("button", { name: "Merge" }).click();
  await expect(
    list.getByRole("button", {
      name: /^Organizer Marc Dubois 06 99 88 77 66 · marc@example\.com/,
    }),
  ).toBeVisible();
  await expect(list.getByText("Marc", { exact: true })).toBeHidden();

  // Deleted, confirmed.
  await list.getByRole("button", { name: "Actions for Claire Martin" }).click();
  await leader.getByRole("menuitem", { name: "Delete" }).click();
  await leader.getByRole("alertdialog").getByRole("button", { name: "Delete the contact" }).click();
  await expect(list.getByText("Claire Martin")).toBeHidden();

  // The venues page: a venue with a gig can't be deleted.
  await leader.getByRole("link", { name: "Venues" }).first().click();
  await leader
    .getByRole("list", { name: "Venues" })
    .getByRole("link", { name: /Le Mondo Bizarro/ })
    .click();
  await expect(leader.getByText(/^Used by \d+ gigs?: can't be deleted\.$/)).toBeVisible();
  await expect(leader.getByRole("button", { name: "Delete" })).toBeDisabled();
  await expect(leader.getByRole("region", { name: "Gigs here" }).getByRole("link")).not.toHaveCount(
    0,
  );

  // A contact added from the venue's page stays in its form, then is saved with the venue.
  const contacts = leader.getByRole("region", { name: "Contacts" });
  await contacts.getByRole("button", { name: "Add contact" }).click();
  const added = leader.getByRole("dialog");
  await added.getByRole("combobox", { name: "Name" }).fill("Yann the sound tech");
  await added.getByRole("button", { name: "Add", exact: true }).click();
  await expect(added).toBeHidden();
  await expect(contacts.getByText("Yann the sound tech")).toBeVisible();
  await leader.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByText("Venue saved")).toBeVisible();
  await leader.reload();
  await expect(
    leader.getByRole("region", { name: "Contacts" }).getByText("Yann the sound tech"),
  ).toBeVisible();
});

test("saving a gig keeps the venue's contacts added meanwhile elsewhere (#329)", async () => {
  const api = `/api/bands/${band.slug}`;
  const gigId = await addGig(band, {
    date: dateIn(70),
    venue: { name: "Le Bar'Hic", city: "Rennes" },
  });
  // The form is open on one phone...
  await leader.goto(`/b/${band.slug}/gigs/${gigId}/edit`);
  await expect(leader.getByLabel("City")).toHaveValue("Rennes");
  // ...while the venue's contact is added on another one.
  const gig = (await (await leader.request.get(`${api}/gigs/${gigId}`)).json()) as {
    gig: { venue: { id: string } };
  };
  const contact = (await (
    await leader.request.post(`${api}/contacts`, { data: { name: "Romu", type: "organizer" } })
  ).json()) as { contact: { id: string } };
  const linked = await leader.request.patch(`${api}/venues/${gig.gig.venue.id}`, {
    data: { name: "Le Bar'Hic", city: "Rennes", contactIds: [contact.contact.id] },
  });
  expect(linked.ok()).toBe(true);

  // Saved from the first phone: the venue keeps its contact.
  await leader.getByLabel(/^Title/).fill("Bar'Hic night");
  await leader.getByRole("button", { name: "Save" }).click();
  await expect(leader.getByRole("heading", { name: "Bar'Hic night" })).toBeVisible();
  await expect(leader.getByText("From the venue (Le Bar'Hic)")).toBeVisible();
  await expect(leader.getByText("Romu")).toBeVisible();
});
