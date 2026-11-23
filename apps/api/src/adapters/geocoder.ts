/** A point on the map, in degrees (WGS 84). */
export type Coordinates = { latitude: number; longitude: number };

/** Where a venue's address is placed on the map (#333): Nominatim, or a fake in tests. */
export type Geocoder = {
  /** The address's coordinates; null when it isn't found. Throws when the service fails. */
  locate(query: string): Promise<Coordinates | null>;
};

/** Nominatim's usage policy: at most one request a second, from the whole application. */
export const NOMINATIM_INTERVAL_MS = 1000;

type NominatimPlace = { lat: string; lon: string };

/**
 * OpenStreetMap's geocoding service (Nominatim, #333), called by the API, never the browser:
 * only the venue's address is sent, the app named in its User-Agent, as its usage policy asks.
 * Requests wait for each other, at least `intervalMs` apart (one a second): within this
 * container, the only one at the beta's scale. Nothing is cached here: the venue keeps the answer.
 */
export function createNominatimGeocoder({
  userAgent,
  baseUrl = "https://nominatim.openstreetmap.org",
  timeoutMs = 8000,
  intervalMs = NOMINATIM_INTERVAL_MS,
  fetch = globalThis.fetch,
  now = () => Date.now(),
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}: {
  userAgent: string;
  baseUrl?: string;
  timeoutMs?: number;
  intervalMs?: number;
  /** Tests pass their own. */
  fetch?: (url: URL, init: RequestInit) => Promise<Response>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): Geocoder {
  // The previous request's turn: each one waits for it, then for the interval.
  let queue: Promise<unknown> = Promise.resolve();
  let last = Number.NEGATIVE_INFINITY;

  async function request(query: string): Promise<Coordinates | null> {
    const wait = last + intervalMs - now();
    if (wait > 0) await sleep(wait);
    last = now();
    const url = new URL("/search", baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    const res = await fetch(url, {
      headers: { "user-agent": userAgent, accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`Nominatim answered ${res.status}`);
    const [place] = (await res.json()) as NominatimPlace[];
    if (!place) return null;
    const latitude = Number(place.lat);
    const longitude = Number(place.lon);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }

  return {
    locate(query) {
      const turn = queue.then(() => request(query));
      queue = turn.catch(() => undefined);
      return turn;
    },
  };
}

/** A geocoder for tests: `places` by query; `failing` makes it throw. */
export function createMemoryGeocoder(places: Record<string, Coordinates> = {}) {
  const queries: string[] = [];
  const state = { failing: false };
  const geocoder: Geocoder = {
    async locate(query) {
      queries.push(query);
      if (state.failing) throw new Error("Geocoder down");
      return places[query] ?? null;
    },
  };
  return { geocoder, queries, places, state };
}
