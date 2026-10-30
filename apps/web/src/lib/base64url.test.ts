import { describe, expect, test } from "bun:test";
import { base64UrlBytes } from "./base64url";

describe("base64UrlBytes", () => {
  test("base64url without padding, as VAPID keys are written", () => {
    expect([...base64UrlBytes("BP-_")]).toEqual([0x04, 0xff, 0xbf]);
    expect([...base64UrlBytes("AQ")]).toEqual([1]);
    expect(
      base64UrlBytes(
        "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
      ),
    ).toHaveLength(65);
  });
});
