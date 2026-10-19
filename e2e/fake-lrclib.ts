/**
 * A fake LRCLIB for the end-to-end tests (started by playwright.config.ts): two versions of
 * "Zombie" with different lyrics, nothing for any other song.
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

Bun.serve({
  port: Number(process.env.PORT ?? 3101),
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname !== "/api/search") return new Response("Not found", { status: 404 });
    const title = url.searchParams.get("track_name")?.toLowerCase();
    return Response.json(title === "zombie" ? ZOMBIE : []);
  },
});
