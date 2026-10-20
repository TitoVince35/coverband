import { describe, expect, test } from "bun:test";
import { fits, LOCAL_NAMES } from "./tls";

describe("fits", () => {
  const issued = { names: [...LOCAL_NAMES, "192.168.1.20"], authority: "a" };

  test("the certificate is kept while it covers every name and the authority is the same", () => {
    expect(fits(issued, { names: LOCAL_NAMES, authority: "a" })).toBe(true);
    expect(fits(issued, { names: [...LOCAL_NAMES, "192.168.1.20"], authority: "a" })).toBe(true);
  });

  test("it is issued again for a new LAN IP, a new authority, or when none was issued", () => {
    expect(fits(issued, { names: [...LOCAL_NAMES, "192.168.1.31"], authority: "a" })).toBe(false);
    expect(fits(issued, { names: LOCAL_NAMES, authority: "b" })).toBe(false);
    expect(fits(undefined, { names: LOCAL_NAMES, authority: "a" })).toBe(false);
  });
});
