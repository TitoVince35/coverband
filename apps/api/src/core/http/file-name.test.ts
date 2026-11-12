import { expect, test } from "bun:test";
import { fileName } from "./file-name";

test("fileName: ASCII and UTF-8 forms, never quotes", () => {
  expect(fileName('Grille "Sol"', "pdf")).toBe(
    `filename="Grille Sol.pdf"; filename*=UTF-8''Grille%20%22Sol%22.pdf`,
  );
  expect(fileName("Accords é", "jpg")).toBe(
    `filename="Accords e.jpg"; filename*=UTF-8''Accords%20%C3%A9.jpg`,
  );
});
