import { describe, expect, test } from "bun:test";
import { showPushOffer } from "./push-offer";

describe("showPushOffer", () => {
  const base = { installed: true, dismissed: false, state: "off" as const };

  test("in the installed app, when notifications are off on this device", () => {
    expect(showPushOffer(base)).toBe(true);
  });

  test("not in the browser: the install card comes first", () => {
    expect(showPushOffer({ ...base, installed: false })).toBe(false);
  });

  test("not once dismissed", () => {
    expect(showPushOffer({ ...base, dismissed: true })).toBe(false);
  });

  test("only when one tap turns them on: on, blocked or unsupported stay on the account page", () => {
    for (const state of ["on", "denied", "install", "unsupported", undefined] as const)
      expect(showPushOffer({ ...base, state })).toBe(false);
  });
});
