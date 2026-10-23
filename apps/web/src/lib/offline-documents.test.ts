import { expect, test } from "bun:test";
import { documentsToKeep } from "./offline-documents";

const doc = (id: string, kind: "photo" | "pdf" | "guitarpro", size: number, day: number) => ({
  id,
  kind,
  size,
  createdAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00Z`,
});

test("documentsToKeep (#240): photos and PDFs, the newest first, within the budget", () => {
  const documents = [
    doc("old", "pdf", 40, 1),
    doc("new", "photo", 40, 20),
    doc("gp", "guitarpro", 1, 21),
  ];
  // Never Guitar Pro or MuseScore files.
  expect([...documentsToKeep(documents, 0, 100)].sort()).toEqual(["new", "old"]);
  // Other bands' documents take their share: the newest fits, not the oldest.
  expect([...documentsToKeep(documents, 30, 100)]).toEqual(["new"]);
  // A smaller one further down still fits.
  expect([
    ...documentsToKeep(
      [doc("a", "pdf", 80, 3), doc("b", "pdf", 30, 2), doc("c", "pdf", 10, 1)],
      0,
      100,
    ),
  ]).toEqual(["a", "c"]);
});
