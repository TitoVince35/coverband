// Draws the database model from the Drizzle schema: Graphviz DOT, rendered to PDF and SVG with
// `dot` (sudo apt install graphviz). Tables are grouped by the module that defines them.
//   bun run db:diagram       → doc/schemas/YYmmddhhmm_db-diagram.{pdf,svg,dot}
//   bun run db:diagram out   → the same files in out/

import { resolve } from "node:path";
import { is } from "drizzle-orm";
import { getTableConfig, type PgColumn, PgTable } from "drizzle-orm/pg-core";

const MODULES: Record<string, Record<string, unknown>> = {
  auth: await import("../adapters/auth-schema"),
  bands: await import("../modules/bands/schema"),
  instruments: await import("../modules/instruments/schema"),
  invitations: await import("../modules/invitations/schema"),
  notifications: await import("../modules/notifications/schema"),
  songs: await import("../modules/songs/schema"),
  activity: await import("../core/activity/schema"),
};

const COLORS = ["#e8f0fe", "#fef7e0", "#e6f4ea", "#fce8e6", "#f3e8fd", "#e4f7fb", "#fff0e0"];

// The schema relies on `casing: "snake_case"`: columns declared without a name take their key.
const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const columnName = (c: PgColumn) => (c.keyAsName ? snake(c.name) : c.name);
const esc = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function columnType(c: PgColumn): string {
  const enumName = (c as { enum?: { enumName: string } }).enum?.enumName;
  return enumName ?? c.getSQLType().replace(" with time zone", "tz");
}

/** The files' prefix, in local time: 2026/11/10 15:30 → "2611101530". */
export function timestampPrefix(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return [
    date.getFullYear() % 100,
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ]
    .map(two)
    .join("");
}

/** The whole schema as a Graphviz DOT graph. */
export function databaseDot(): string {
  const lines: string[] = [
    "digraph db {",
    '  graph [rankdir=LR, splines=true, overlap=false, nodesep=0.5, ranksep=1.2, fontname="Helvetica", label="CoverBand database model", labelloc=t, fontsize=20];',
    '  node [shape=plaintext, fontname="Helvetica", fontsize=10];',
    '  edge [arrowhead=crow, arrowtail=none, color="#5f6368", fontname="Helvetica", fontsize=8];',
  ];
  const edges: string[] = [];

  Object.entries(MODULES).forEach(([module, exports], i) => {
    lines.push(`  subgraph "cluster_${module}" {`);
    lines.push(
      `    label="${module}"; style="rounded,filled"; color="#bdc1c6"; fillcolor="${COLORS[i % COLORS.length]}"; fontsize=14;`,
    );
    for (const table of Object.values(exports)) {
      if (!is(table, PgTable)) continue;
      const config = getTableConfig(table);
      const fkColumns = new Set(
        config.foreignKeys.flatMap((fk) => fk.reference().columns.map(columnName)),
      );
      const pkColumns = new Set([
        ...config.columns.filter((c) => c.primary).map(columnName),
        ...config.primaryKeys.flatMap((pk) => pk.columns.map(columnName)),
      ]);
      const rows = config.columns.map((c) => {
        const name = columnName(c);
        const marks = [pkColumns.has(name) && "PK", fkColumns.has(name) && "FK", c.isUnique && "UQ"]
          .filter(Boolean)
          .join(" ");
        const label = pkColumns.has(name) ? `<B>${esc(name)}</B>` : esc(name);
        const type = `${esc(columnType(c))}${c.notNull ? "" : "?"}`;
        return `<TR><TD PORT="${name}" ALIGN="LEFT">${label}</TD><TD ALIGN="LEFT"><FONT COLOR="#5f6368">${type}</FONT></TD><TD ALIGN="LEFT">${marks && `<FONT COLOR="#1a73e8">${marks}</FONT>`}</TD></TR>`;
      });
      lines.push(
        `    "${config.name}" [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="4" BGCOLOR="white"><TR><TD COLSPAN="3" BGCOLOR="#3c4043"><FONT COLOR="white"><B>${config.name}</B></FONT></TD></TR>${rows.join("")}</TABLE>>];`,
      );
      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        const target = getTableConfig(ref.foreignTable).name;
        const from = columnName(ref.columns[0] as PgColumn);
        const to = columnName(ref.foreignColumns[0] as PgColumn);
        const onDelete = fk.onDelete && fk.onDelete !== "no action" ? fk.onDelete : "";
        edges.push(
          `  "${target}":"${to}":e -> "${config.name}":"${from}":w [label="${onDelete}"];`,
        );
      }
    }
    lines.push("  }");
  });
  lines.push(...edges, "}");
  return lines.join("\n");
}

if (import.meta.main) {
  const dir = resolve(Bun.argv[2] ?? resolve(import.meta.dir, "../../../../doc/schemas"));
  const out = `${dir}/${timestampPrefix(new Date())}_db-diagram`;
  await Bun.write(`${out}.dot`, databaseDot());
  for (const format of ["pdf", "svg"]) {
    const dot = Bun.spawnSync(["dot", `-T${format}`, `${out}.dot`, "-o", `${out}.${format}`]);
    if (dot.exitCode !== 0) {
      console.error(dot.stderr.toString() || "dot failed: is Graphviz installed?");
      process.exit(1);
    }
  }
  console.log(`Wrote ${out}.pdf, ${out}.svg (and the ${out}.dot source)`);
}
