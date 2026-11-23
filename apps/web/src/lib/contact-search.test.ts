import { describe, expect, test } from "bun:test";
import { searchContacts } from "./contact-search";

const contacts = [{ name: "Marie-Yann Le Goff" }, { name: "Yann" }, { name: "Nico (son)" }];

describe("searchContacts", () => {
  test("nothing for an empty name", () => {
    expect(searchContacts(contacts, " ")).toEqual([]);
  });
  test("every word, accents and case ignored, names starting with it first", () => {
    expect(searchContacts(contacts, "ya").map((c) => c.name)).toEqual([
      "Yann",
      "Marie-Yann Le Goff",
    ]);
    expect(searchContacts(contacts, "goff yann").map((c) => c.name)).toEqual([
      "Marie-Yann Le Goff",
    ]);
    expect(searchContacts(contacts, "NICO").map((c) => c.name)).toEqual(["Nico (son)"]);
  });
});
