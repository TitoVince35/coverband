import { expect, test } from "bun:test";
import { JPEG, PNG, WEBP } from "../test-deps";
import { imageType } from "./images";

test("imageType recognises WebP, JPEG and PNG by their first bytes, among the accepted ones", () => {
  const all = ["image/webp", "image/jpeg", "image/png"] as const;
  expect(imageType(WEBP, all)).toEqual({ type: "image/webp", extension: "webp" });
  expect(imageType(JPEG, all)).toEqual({ type: "image/jpeg", extension: "jpg" });
  expect(imageType(PNG, all)).toEqual({ type: "image/png", extension: "png" });
  expect(imageType(PNG, ["image/webp", "image/jpeg"])).toBeNull();
  expect(imageType(new TextEncoder().encode("<svg onload=alert(1)>"), all)).toBeNull();
  expect(imageType(new Uint8Array(), all)).toBeNull();
});
