/**
 * Fake music services for the end-to-end tests (started by playwright.config.ts), so "I feel
 * lucky" never reaches the real ones. Both only know "Zombie" by The Cranberries: Deezer under
 * /deezer (an album with its genre), YouTube's Data API under /youtube/v3 (a live version first,
 * then the album track of the "Topic" channel and the official video) and its thumbnails under
 * /ytimg.
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

const VIDEOS = [
  {
    id: "Zombie0Live",
    snippet: {
      title: "The Cranberries - Zombie (Live at Woodstock 1994)",
      channelTitle: "The Cranberries",
      description: "Live.",
    },
    contentDetails: { duration: "PT5M54S" },
  },
  {
    id: "Zombie0Topi",
    snippet: {
      title: "Zombie",
      channelTitle: "The Cranberries - Topic",
      description: "Provided to YouTube by Universal Music Group\n\nZombie · The Cranberries",
    },
    contentDetails: { duration: "PT5M7S" },
  },
  {
    id: "Zombie0Clip",
    snippet: {
      title: "The Cranberries - Zombie (Official Music Video)",
      channelTitle: "TheCranberriesVEVO",
      description: "Official video.",
    },
    contentDetails: { duration: "PT5M6S" },
  },
];

function youtube(url: URL) {
  if (url.searchParams.get("key") !== "e2e-youtube-key") {
    return Response.json({ error: { code: 400, message: "API key not valid" } }, { status: 400 });
  }
  if (url.pathname === "/youtube/v3/search") {
    const query = url.searchParams.get("q")?.toLowerCase() ?? "";
    const items = query.includes("zombie") ? VIDEOS.map((v) => ({ id: { videoId: v.id } })) : [];
    return Response.json({ items });
  }
  if (url.pathname === "/youtube/v3/videos") {
    const ids = url.searchParams.get("id")?.split(",") ?? [];
    return Response.json({ items: VIDEOS.filter((v) => ids.includes(v.id)) });
  }
  return new Response("Not found", { status: 404 });
}

const thumbnail = Bun.file(new URL("./fixtures/thumbnail.jpg", import.meta.url));

Bun.serve({
  port: Number(process.env.PORT ?? 3103),
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname.startsWith("/deezer/")) return deezer(url);
    if (url.pathname.startsWith("/youtube/v3/")) return youtube(url);
    if (/^\/ytimg\/vi\/[\w-]{11}\/mqdefault\.jpg$/.test(url.pathname)) {
      return new Response(thumbnail, { headers: { "content-type": "image/jpeg" } });
    }
    return new Response("Not found", { status: 404 });
  },
});
