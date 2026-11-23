import { describe, expect, test } from "bun:test";
import { createNominatimGeocoder } from "./geocoder";

/** A fake Nominatim: answers by query, records each request and when it came. */
function fakeNominatim(answer: (query: string) => Response | Promise<Response>) {
  let clock = 0;
  const requests: { url: URL; userAgent: string | null; at: number }[] = [];
  const geocoder = createNominatimGeocoder({
    userAgent: "Coverband Beta (https://app.test)",
    baseUrl: "https://nominatim.test",
    fetch: async (url, init) => {
      requests.push({
        url,
        userAgent: new Headers(init.headers).get("user-agent"),
        at: clock,
      });
      return answer(url.searchParams.get("q") ?? "");
    },
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  return { geocoder, requests, tick: (ms: number) => (clock += ms) };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

describe("the Nominatim geocoder (#333)", () => {
  test("found: the first place's coordinates; only the address sent, the app named", async () => {
    const fake = fakeNominatim(() => json([{ lat: "48.1137", lon: "-1.6801" }]));
    expect(await fake.geocoder.locate("19 place Sainte-Anne, Rennes")).toEqual({
      latitude: 48.1137,
      longitude: -1.6801,
    });
    const [request] = fake.requests;
    expect(request?.url.origin).toBe("https://nominatim.test");
    expect(request?.url.pathname).toBe("/search");
    expect(Object.fromEntries(request?.url.searchParams ?? [])).toEqual({
      q: "19 place Sainte-Anne, Rennes",
      format: "jsonv2",
      limit: "1",
    });
    expect(request?.userAgent).toBe("Coverband Beta (https://app.test)");
  });

  test("not found: null", async () => {
    const fake = fakeNominatim(() => json([]));
    expect(await fake.geocoder.locate("Nowhere at all")).toBeNull();
  });

  test("out of reach or refusing: throws, and the next request still goes", async () => {
    let down = true;
    const fake = fakeNominatim(() => {
      if (down) throw new TypeError("fetch failed");
      return json([{ lat: "1", lon: "2" }]);
    });
    await expect(fake.geocoder.locate("a")).rejects.toThrow("fetch failed");
    down = false;
    expect(await fake.geocoder.locate("b")).toEqual({ latitude: 1, longitude: 2 });
    const refusing = fakeNominatim(() => json({ error: "busy" }, 429));
    await expect(refusing.geocoder.locate("c")).rejects.toThrow("429");
  });

  test("at most one request a second, in order", async () => {
    const fake = fakeNominatim((query) => json([{ lat: query.length, lon: 0 }]));
    await Promise.all([
      fake.geocoder.locate("one"),
      fake.geocoder.locate("two"),
      fake.geocoder.locate("three"),
    ]);
    expect(fake.requests.map((r) => [r.url.searchParams.get("q"), r.at])).toEqual([
      ["one", 0],
      ["two", 1000],
      ["three", 2000],
    ]);
    // Later on, no wait.
    fake.tick(5000);
    await fake.geocoder.locate("four");
    expect(fake.requests.at(-1)?.at).toBe(7000);
  });
});
