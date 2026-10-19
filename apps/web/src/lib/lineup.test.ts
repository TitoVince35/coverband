import { expect, test } from "bun:test";
import { lineupOrder } from "./lineup";

const members = [
  { userId: "1", name: "Zoé" },
  { userId: "2", name: "emma" },
  { userId: "3", name: "Élodie" },
  { userId: "4", name: "Bob" },
];

const names = (list: readonly { name: string }[]) => list.map((m) => m.name);

test("the current member comes first, then the others alphabetically", () => {
  expect(names(lineupOrder(members, "1", "fr"))).toEqual(["Zoé", "Bob", "Élodie", "emma"]);
});

test("ignores accents and case", () => {
  expect(names(lineupOrder(members, "4", "en"))).toEqual(["Bob", "Élodie", "emma", "Zoé"]);
});

test("leaves the list as given untouched", () => {
  lineupOrder(members, "1", "en");
  expect(names(members)).toEqual(["Zoé", "emma", "Élodie", "Bob"]);
});
