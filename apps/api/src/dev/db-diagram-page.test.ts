import { describe, expect, test } from "bun:test";
import { darkTint, diagramInfo, diagramPage, stampFromPrefix } from "./db-diagram-page";

const SVG = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="300pt" height="200pt"
 viewBox="0.00 0.00 300.25 200.00" xmlns="http://www.w3.org/2000/svg">
<g id="graph0" class="graph">
<polygon fill="white" stroke="none" points="-4,4 -4,-200 300,-200 300,4 -4,4"/>
<text xml:space="preserve" x="150" y="-180" font-size="20.00">CoverBand database model</text>
<g id="clust1" class="cluster">
<title>cluster_auth</title>
<path fill="#e8f0fe" stroke="#bdc1c6" d="M0,0"/>
</g>
<g id="clust2" class="cluster">
<title>cluster_bands</title>
<path fill="#fef7e0" stroke="#bdc1c6" d="M0,0"/>
</g>
<g id="node1" class="node"></g>
<g id="node2" class="node"></g>
<g id="node3" class="node"></g>
<g id="edge1" class="edge"></g>
</g>
</svg>`;

describe("diagramInfo", () => {
  test("reads the width, tables, foreign keys and groups", () => {
    expect(diagramInfo(SVG)).toEqual({
      width: 301,
      tables: 3,
      foreignKeys: 1,
      groups: [
        { id: "clust1", name: "auth", fill: "#e8f0fe" },
        { id: "clust2", name: "bands", fill: "#fef7e0" },
      ],
    });
  });
});

describe("darkTint", () => {
  test("keeps the hue at a low lightness", () => {
    expect(darkTint("#e8f0fe")).toBe("hsl(218 35% 15%)");
    expect(darkTint("#ffffff")).toBe("hsl(0 0% 15%)");
  });
});

describe("stampFromPrefix", () => {
  test("turns the file prefix into a readable local time", () => {
    expect(stampFromPrefix("2611110849")).toBe("Wednesday 2026/11/11 08:49");
  });
});

describe("diagramPage", () => {
  const page = diagramPage(SVG, "Wednesday 2026/11/11 08:49");

  test("inlines the SVG without its prolog, background and title", () => {
    expect(page).not.toContain("<?xml");
    expect(page).not.toContain('points="-4,4');
    expect(page).not.toContain('font-size="20.00"');
    expect(page).toContain('<svg id="diagram"');
  });

  test("gives each group a light and a dark color, and a chip", () => {
    expect(page).toContain("--g0:#e8f0fe;");
    expect(page).toContain("--g0:hsl(218 35% 15%);");
    expect(page).toContain('<span class="chip g1">bands</span>');
  });

  test("states the counts and the date", () => {
    expect(page).toContain("3 tables · 1 foreign keys");
    expect(page).toContain("on Wednesday 2026/11/11 08:49");
  });
});
