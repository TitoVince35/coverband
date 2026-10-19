/**
 * A fake LRCLIB for the end-to-end tests (started by playwright.config.ts): two versions of
 * "Zombie" with different lyrics, "Creep" as an instrumental (but a free search for "creep
 * acoustic" finds a sung version), nothing for any other song.
 */
const ZOMBIE = [
  {
    id: 1,
    trackName: "Zombie",
    artistName: "The Cranberries",
    albumName: "No Need to Argue",
    duration: 306,
    instrumental: false,
    plainLyrics: "Another head hangs lowly\nChild is slowly taken",
  },
  {
    id: 2,
    trackName: "Zombie",
    artistName: "The Cranberries",
    albumName: "MTV Unplugged",
    duration: 82,
    instrumental: false,
    plainLyrics: "In your head, in your head\nZombie, zombie",
  },
];

const CREEP = [
  {
    id: 3,
    trackName: "Creep",
    artistName: "Radiohead",
    albumName: "Pablo Honey",
    duration: 238,
    instrumental: true,
    plainLyrics: null,
  },
];

const CREEP_ACOUSTIC = [
  {
    id: 4,
    trackName: "Creep (Acoustic)",
    artistName: "Radiohead",
    albumName: "My Iron Lung",
    duration: 260,
    instrumental: false,
    plainLyrics: "When you were here before\nCouldn't look you in the eye",
  },
];

Bun.serve({
  port: Number(process.env.PORT ?? 3101),
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname !== "/api/search") return new Response("Not found", { status: 404 });
    const text = url.searchParams.get("q")?.toLowerCase();
    if (text !== undefined) return Response.json(text === "creep acoustic" ? CREEP_ACOUSTIC : []);
    const title = url.searchParams.get("track_name")?.toLowerCase();
    return Response.json(title === "zombie" ? ZOMBIE : title === "creep" ? CREEP : []);
  },
});
