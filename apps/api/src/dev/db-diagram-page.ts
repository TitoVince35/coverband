// Wraps the SVG drawn by `bun run db:diagram` into a standalone HTML page (legend, group chips,
// zoom and drag, light and dark themes), ready to publish as a claude.ai artifact (the
// `db-diagram` skill) or to open in a browser.
//   bun run db:diagram:page              → the latest doc/schemas/*_db-diagram.svg, page next to it
//   bun run db:diagram:page some.svg     → some.html

import { basename, resolve } from "node:path";

const DIR = resolve(import.meta.dir, "../../../../doc/schemas");

type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** The dark-theme tint of a light pastel group color: same hue, low lightness. */
export function darkTint(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as Rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  const hue = Math.round((h * 60 + 360) % 360);
  const saturation = d > 0 ? 35 : 0;
  return `hsl(${hue} ${saturation}% 15%)`;
}

export type DiagramInfo = {
  width: number;
  tables: number;
  foreignKeys: number;
  groups: { id: string; name: string; fill: string }[];
};

/** What the page needs to know about the Graphviz SVG. */
export function diagramInfo(svg: string): DiagramInfo {
  const viewBox = svg.match(/viewBox="[\d.]+ [\d.]+ ([\d.]+) [\d.]+"/);
  const groups = [
    ...svg.matchAll(
      /<g id="(clust\d+)" class="cluster">\s*<title>cluster_([^<]+)<\/title>\s*<path fill="(#[0-9a-f]{6})"/g,
    ),
  ].map(([, id, name, fill]) => ({ id: id as string, name: name as string, fill: fill as string }));
  return {
    width: Math.ceil(Number(viewBox?.[1] ?? 1000)),
    tables: svg.match(/class="node"/g)?.length ?? 0,
    foreignKeys: svg.match(/class="edge"/g)?.length ?? 0,
    groups,
  };
}

/** "2611110849" → "Wednesday 2026/11/11 08:49" (the briefs' timestamp style). */
export function stampFromPrefix(prefix: string): string {
  const [yy, mm, dd, hh, mi] = (prefix.match(/\d{2}/g) ?? []).map(Number);
  const date = new Date(2000 + (yy ?? 0), (mm ?? 1) - 1, dd ?? 1, hh ?? 0, mi ?? 0);
  const two = (n: number) => String(n).padStart(2, "0");
  const day = date.toLocaleDateString("en-GB", { weekday: "long" });
  return `${day} ${date.getFullYear()}/${two(date.getMonth() + 1)}/${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** The page's HTML (no <html>/<head>/<body>: the artifact host adds them). */
export function diagramPage(rawSvg: string, stamp: string): string {
  const info = diagramInfo(rawSvg);
  let svg = rawSvg.slice(rawSvg.indexOf("<svg"));
  svg = svg.replace(
    /<svg width="[^"]*" height="[^"]*"/,
    `<svg id="diagram" role="img" aria-label="CoverBand database model: ${info.tables} tables in ${info.groups.length} groups"`,
  );
  // The page draws its own title and background.
  svg = svg.replace(/<polygon fill="white" stroke="none" points="-4,4[^>]*\/>\n/, "");
  svg = svg.replace(/<text[^>]*font-size="20.00">[^<]*<\/text>\n/, "");

  const tokens = (dark: boolean) =>
    info.groups.map((g, i) => `--g${i}:${dark ? darkTint(g.fill) : g.fill};`).join(" ");
  const groupRules = info.groups
    .map((g, i) => `#${g.id} path{fill:var(--g${i})} .g${i}{background:var(--g${i})}`)
    .join("\n");
  const chips = info.groups.map((g, i) => `<span class="chip g${i}">${g.name}</span>`).join("");
  const dark = `--bg:#14161a; --panel:#1b1e23; --fg:#e6e8eb; --muted:#9aa0a8; --line:#2e333a;
  --accent:#7cacf8; --card:#1f2329; --cell:#3a4048; --edge:#8a919a; --head:#0f1114;
  ${tokens(true)} color-scheme:dark;`;

  return `<title>CoverBand Database Model</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Layout: slim header with legend and zoom controls, then the Graphviz diagram in its own scroll pane */
:root{
  --bg:#f6f7f9; --panel:#ffffff; --fg:#1c1f24; --muted:#5f6368; --line:#d5d9e0;
  --accent:#1a73e8; --card:#ffffff; --cell:#c9ced6; --edge:#6b7078; --head:#3c4043;
  ${tokens(false)}
  --sans:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif; --mono:"JetBrains Mono",ui-monospace,"SFMono-Regular",Menlo,monospace;
  --w:${info.width}px;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${dark}}}
:root[data-theme="dark"]{${dark}}
body{background:var(--bg);color:var(--fg);font-family:var(--sans)}
.wrap{max-width:1200px;margin:0 auto;padding-block:28px 40px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:flex;flex-direction:column;gap:18px}
header{display:flex;flex-wrap:wrap;align-items:end;justify-content:space-between;gap:12px 24px}
h1{margin:0;font-size:1.6rem;font-weight:600;letter-spacing:-.01em;text-wrap:balance}
.meta{margin:4px 0 0;color:var(--muted);font-size:.85rem}
.meta code{font-family:var(--mono);font-size:.8rem}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:.8rem;color:var(--muted);align-items:center}
.legend b{font-family:var(--mono);color:var(--accent);font-weight:600}
.groups{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:.75rem;padding:3px 9px;border-radius:999px;border:1px solid var(--line);color:var(--fg)}
.zoom{display:flex;gap:4px;align-items:center}
.zoom button{font:inherit;font-size:.85rem;min-width:36px;height:32px;padding:0 10px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--fg);cursor:pointer}
.zoom button:hover{border-color:var(--accent)}
.zoom button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.zoom output{font-variant-numeric:tabular-nums;font-size:.8rem;color:var(--muted);min-width:44px;text-align:center}
.pane{overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;max-height:80vh;cursor:grab}
.pane.drag{cursor:grabbing;user-select:none}
#diagram{display:block;width:calc(var(--w) * var(--z,1));height:auto;margin:0 auto;max-width:none}
/* Graphviz writes literal colors; re-skin them through the tokens */
#diagram text{fill:var(--fg)}
#diagram text[fill="white"]{fill:#fff}
#diagram text[fill="#5f6368"]{fill:var(--muted)}
#diagram text[fill="#1a73e8"]{fill:var(--accent)}
#diagram polygon[fill="white"]{fill:var(--card)}
#diagram polygon[fill="#3c4043"]{fill:var(--head)}
#diagram [stroke="black"]{stroke:var(--cell)}
#diagram .edge path,#diagram .edge polygon,#diagram .edge polyline{stroke:var(--edge)}
#diagram .cluster path{stroke:var(--line)}
#diagram .cluster text{font-weight:600}
${groupRules}
</style>
<div class="wrap">
  <header>
    <div>
      <h1>CoverBand database model</h1>
      <p class="meta">${info.tables} tables · ${info.foreignKeys} foreign keys · drawn by <code>bun run db:diagram</code> from the Drizzle schema on ${stamp}</p>
    </div>
    <div class="zoom" aria-label="Zoom">
      <button id="zout" type="button" aria-label="Zoom out">−</button>
      <output id="zval">100%</output>
      <button id="zin" type="button" aria-label="Zoom in">+</button>
      <button id="zfit" type="button">Fit width</button>
      <button id="zone" type="button">Actual size</button>
    </div>
  </header>
  <div class="legend">
    <span><b>PK</b> primary key</span><span><b>FK</b> foreign key</span><span><b>UQ</b> unique</span><span><b>?</b> nullable</span><span>bold column: part of the primary key</span><span>crow's foot: the "many" side, labelled with its delete rule</span>
  </div>
  <div class="groups">${chips}</div>
  <div class="pane" id="pane">
${svg}
  </div>
</div>
<script>
(function(){
  var W=${info.width},pane=document.getElementById('pane'),svg=document.getElementById('diagram'),out=document.getElementById('zval');
  var z=1;
  function set(v){z=Math.min(3,Math.max(0.2,v));svg.style.setProperty('--z',z);out.textContent=Math.round(z*100)+'%';}
  document.getElementById('zin').onclick=function(){set(z*1.25)};
  document.getElementById('zout').onclick=function(){set(z/1.25)};
  document.getElementById('zfit').onclick=function(){set((pane.clientWidth-32)/W)};
  document.getElementById('zone').onclick=function(){set(1)};
  pane.addEventListener('wheel',function(e){if(e.ctrlKey||e.metaKey){e.preventDefault();set(z*(e.deltaY<0?1.1:1/1.1));}},{passive:false});
  var sx,sy,sl,st,down=false;
  pane.addEventListener('pointerdown',function(e){if(e.pointerType!=='mouse')return;down=true;sx=e.clientX;sy=e.clientY;sl=pane.scrollLeft;st=pane.scrollTop;pane.classList.add('drag');});
  addEventListener('pointermove',function(e){if(!down)return;pane.scrollLeft=sl-(e.clientX-sx);pane.scrollTop=st-(e.clientY-sy);});
  addEventListener('pointerup',function(){down=false;pane.classList.remove('drag');});
  set(1);
})();
</script>
`;
}

if (import.meta.main) {
  let svgPath = Bun.argv[2] && resolve(Bun.argv[2]);
  if (!svgPath) {
    const latest = [...new Bun.Glob("*_db-diagram.svg").scanSync(DIR)].sort().at(-1);
    if (!latest) {
      console.error(`No *_db-diagram.svg in ${DIR}: run bun run db:diagram first`);
      process.exit(1);
    }
    svgPath = `${DIR}/${latest}`;
  }
  const prefix = basename(svgPath).match(/^(\d{10})_/)?.[1];
  const stamp = prefix ? stampFromPrefix(prefix) : new Date().toISOString().slice(0, 16);
  const out = svgPath.replace(/\.svg$/, ".html");
  await Bun.write(out, diagramPage(await Bun.file(svgPath).text(), stamp));
  console.log(`Wrote ${out}`);
}
