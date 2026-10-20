import { expect, test } from "bun:test";
import { bandInitials } from "./initials";

test("bandInitials takes the first two words, after a leading article", () => {
  expect(bandInitials("The Socks Pistils")).toBe("SP");
  expect(bandInitials("Les Rockeurs d'Été")).toBe("RD");
  expect(bandInitials("L'Été Indien")).toBe("ÉI");
  expect(bandInitials("Queen")).toBe("Q");
  expect(bandInitials("The The")).toBe("T");
  expect(bandInitials("AC/DC")).toBe("AD");
  expect(bandInitials("blink-182")).toBe("B1");
  expect(bandInitials("!!!")).toBe("");
});
