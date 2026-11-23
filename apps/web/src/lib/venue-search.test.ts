import { describe, expect, test } from "bun:test";
import { searchVenues } from "./venue-search";

const venues = [
  { name: "Salle du Mont-Saint-Michel", city: "Pontorson" },
  { name: "Le Mondo Bizarro", city: "Rennes" },
  { name: "L'Étage", city: "Rennes" },
];

describe("searchVenues", () => {
  test("every venue for an empty search", () => {
    expect(searchVenues(venues, "  ")).toHaveLength(3);
  });
  test("words in the name or city, accents and case ignored, names starting with it first", () => {
    expect(searchVenues(venues, "mon").map((v) => v.name)).toEqual([
      "Salle du Mont-Saint-Michel",
      "Le Mondo Bizarro",
    ]);
    expect(searchVenues(venues, "etage").map((v) => v.name)).toEqual(["L'Étage"]);
    expect(searchVenues(venues, "rennes mondo").map((v) => v.name)).toEqual(["Le Mondo Bizarro"]);
    expect(searchVenues(venues, "salle").map((v) => v.name)).toEqual([
      "Salle du Mont-Saint-Michel",
    ]);
  });
});
