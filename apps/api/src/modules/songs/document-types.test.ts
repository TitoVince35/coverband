import { describe, expect, test } from "bun:test";
import { JPEG, PNG, WEBP } from "../../test-deps";
import { documentType } from "./document-types";

const bytes = (text: string) => new TextEncoder().encode(text);
const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0, 0, 0]);
const gp5 = new Uint8Array([24, ...bytes("FICHIER GUITAR PRO v5.10")]);

describe("documentType (#238)", () => {
  test("photos and PDFs from their bytes, whatever their name", () => {
    expect(documentType(JPEG, "chords.jpeg")).toEqual({
      kind: "photo",
      contentType: "image/jpeg",
      extension: "jpg",
    });
    expect(documentType(PNG, "grid")?.contentType).toBe("image/png");
    expect(documentType(WEBP, "photo.webp")?.kind).toBe("photo");
    expect(documentType(bytes("%PDF-1.7\n..."), "Horns.PDF")).toEqual({
      kind: "pdf",
      contentType: "application/pdf",
      extension: "pdf",
    });
  });

  test("Guitar Pro and MuseScore files: their bytes and their extension, as downloads", () => {
    const kind = (data: Uint8Array, name: string) => documentType(data, name)?.kind ?? null;
    expect(kind(zip, "Zombie.gp")).toBe("guitarpro");
    expect(kind(bytes("BCFS\0\0"), "Zombie.gpx")).toBe("guitarpro");
    expect(kind(gp5, "Zombie.gp5")).toBe("guitarpro");
    expect(kind(zip, "Score.MSCZ")).toBe("musescore");
    expect(kind(bytes('<?xml version="1.0"?>\n<museScore version="4.20">'), "Score.mscx")).toBe(
      "musescore",
    );
    expect(documentType(zip, "Zombie.gp")).toEqual({
      kind: "guitarpro",
      contentType: "application/octet-stream",
      extension: "gp",
    });
  });

  test("nothing else: a zip of another kind, a renamed file, an SVG", () => {
    expect(documentType(zip, "letter.docx")).toBeNull();
    expect(documentType(zip, "archive.zip")).toBeNull();
    expect(documentType(bytes("hello"), "Zombie.gp5")).toBeNull();
    expect(documentType(bytes("<html>"), "Score.mscx")).toBeNull();
    expect(documentType(bytes('<svg xmlns="http://www.w3.org/2000/svg">'), "logo.svg")).toBeNull();
    expect(documentType(new Uint8Array(), "empty.pdf")).toBeNull();
  });
});
