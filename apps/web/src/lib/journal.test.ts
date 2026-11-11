import { describe, expect, test } from "bun:test";
import { LINK_MARKER, splitAtMarker } from "./journal";

describe("splitAtMarker (#285)", () => {
  test("splits a sentence around its link, wherever the language puts it", () => {
    expect(splitAtMarker(`Lea added ${LINK_MARKER}`)).toEqual(["Lea added ", ""]);
    expect(splitAtMarker(`Lea a marqué ${LINK_MARKER} comme prêt`)).toEqual([
      "Lea a marqué ",
      " comme prêt",
    ]);
  });

  test("no marker, no link", () => {
    expect(splitAtMarker("Lea created the band")).toBeNull();
  });
});
