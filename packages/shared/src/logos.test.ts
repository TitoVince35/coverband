import { expect, test } from "bun:test";
import { bandLogo } from "./logos";

test("bandLogo is versioned by the storage keys, null without a logo", () => {
  const keys = { logo: "bands/b1/logo/abc.png", thumbnail: "bands/b1/logo/def.webp" };
  expect(bandLogo("the-band", keys)).toEqual({
    url: "/api/bands/the-band/logo?v=abc",
    thumbnailUrl: "/api/bands/the-band/logo/thumbnail?v=def",
  });
  expect(bandLogo("the-band", { logo: null, thumbnail: null })).toBeNull();
});
