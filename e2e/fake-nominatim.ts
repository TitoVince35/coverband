/**
 * A fake Nominatim for the end-to-end tests (started by playwright.config.ts, #333): a few
 * addresses in Rennes are found, any other one isn't.
 */
const PLACES: Record<string, { lat: string; lon: string }> = {
  "19 place Sainte-Anne, Rennes": { lat: "48.1137", lon: "-1.6801" },
  "264 avenue du Général Patton, Rennes": { lat: "48.1314", lon: "-1.6628" },
  "Quai Saint-Cyr, Rennes": { lat: "48.1066", lon: "-1.6944" },
};

Bun.serve({
  port: Number(process.env.PORT ?? 3105),
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") return new Response("ok");
    if (url.pathname !== "/search") return new Response("Not found", { status: 404 });
    const place = PLACES[url.searchParams.get("q") ?? ""];
    return Response.json(place ? [{ ...place, display_name: url.searchParams.get("q") }] : []);
  },
});
