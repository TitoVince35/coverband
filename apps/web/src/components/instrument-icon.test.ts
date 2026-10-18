import { expect, test } from "bun:test";
import { INSTRUMENTS } from "@coverband/shared";
import { ICON_CODES } from "./instrument-icon";

test("every known instrument has its own icon", () => {
  expect([...ICON_CODES].sort()).toEqual([...INSTRUMENTS].sort());
});
