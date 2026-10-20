import { describe, expect, test } from "bun:test";
import { isOpenPage } from "./open-pages";

describe("isOpenPage", () => {
  test("the code screen and the pages behind email links", () => {
    expect(isOpenPage("/access")).toBe(true);
    expect(isOpenPage("/invite/abc")).toBe(true);
    expect(isOpenPage("/reset-password")).toBe(true);
  });

  test("not the others", () => {
    expect(isOpenPage("/")).toBe(false);
    expect(isOpenPage("/login")).toBe(false);
    expect(isOpenPage("/forgot-password")).toBe(false);
    expect(isOpenPage("/invite")).toBe(false);
  });
});
