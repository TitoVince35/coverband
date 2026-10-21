/**
 * Fake music services for the end-to-end tests (started by playwright.config.ts), so "I feel
 * lucky" never reaches the real ones: Deezer under /deezer knows "Zombie" by The Cranberries (an
 * album with its genre) and nothing else.
 */
const DEEZER_ZOMBIE = {
  id: 2,
  title: "Zombie",
  link: "https://www.deezer.com/track/2",
  duration: 307,
  artist: { name: "The Cranberries" },
  album: { id: 77, title: "No Need to Argue" },
};

function deezer(url: URL) {
  if (url.pathname === "/deezer/search") {
    const query = url.searchParams.get("q")?.toLowerCase() ?? "";
    return Response.json({ data: query.includes("zombie") ? [DEEZER_ZOMBIE] : [], total: 0 });
  }
  if (url.pathname === "/deezer/album/77") {
    return Response.json({ id: 77, genres: { data: [{ id: 152, name: "Rock" }] } });
  }
  return Response.json({ error: { type: "DataException", message: "no data", code: 800 } });
}

Bun.serve({
  port: Number(process.env.PORT ?? 3103),
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname.startsWith("/deezer/")) return deezer(url);
    return new Response("Not found", { status: 404 });
  },
});
