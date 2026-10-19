import { describe, expect, test } from "bun:test";
import { dirname, join, normalize } from "node:path";

// The API's import boundaries (apps/api/CLAUDE.md, "Layout"), checked on every file's imports:
// - routes don't touch the database (no drizzle-orm, no tables);
// - a module's other files don't know HTTP (no Hono), except its guard;
// - a module reaches another one only through its service.ts (or the bands guard); schema files
//   may reference other schemas, for foreign keys;
// - a module uses only its own tables, the auth adapter's (users...) and core's (activity);
// - core uses no feature, except their tables (foreign keys, the schema re-export);
// - no import cycle between modules (schemas and type-only imports aside).

/** Source files by path relative to src/. */
type Sources = Map<string, string>;

type Import = { spec: string; names: string[]; target: string | null; typeOnly: boolean };

const IMPORT =
  /import\s+(type\s+)?(?:\{([^}]*)\}|[\w*\s,]+)\s+from\s+"([^"]+)"|export\s+\*\s+from\s+"([^"]+)"/g;

function importsOf(file: string, source: string): Import[] {
  return [...source.matchAll(IMPORT)].map((match) => {
    const spec = match[3] ?? match[4] ?? "";
    const names = (match[2] ?? "")
      .split(",")
      .map((name) => name.replace(/^\s*type\s+/, "").trim())
      .filter(Boolean);
    const target = spec.startsWith(".") ? `${normalize(join(dirname(file), spec))}.ts` : null;
    return { spec, names, target, typeOnly: match[1] !== undefined };
  });
}

const moduleOf = (path: string) => /^modules\/([^/]+)\//.exec(path)?.[1] ?? null;
const isRoutes = (path: string) => /^modules\/[^/]+\/([\w-]+-)?routes\.ts$/.test(path);
const isSchema = (path: string) => path.endsWith("schema.ts");

/** Every table and enum, by the schema file defining it. */
function tableOwners(sources: Sources) {
  const owners = new Map<string, string>();
  for (const [path, source] of sources) {
    if (!isSchema(path) || path === "core/db/schema.ts") continue;
    for (const [, name] of source.matchAll(/export const (\w+)/g)) owners.set(name ?? "", path);
  }
  return owners;
}

export function violations(sources: Sources): string[] {
  const found: string[] = [];
  const owners = tableOwners(sources);
  const edges = new Map<string, Set<string>>();

  for (const [file, source] of sources) {
    const mine = moduleOf(file);
    for (const { spec, names, target, typeOnly } of importsOf(file, source)) {
      const theirs = target ? moduleOf(target) : null;

      if (isRoutes(file) && (spec.startsWith("drizzle-orm") || (target && isSchema(target)))) {
        found.push(`${file}: routes don't query the database (${spec})`);
      }
      const http = spec === "hono" || spec.startsWith("hono/") || spec.startsWith("@hono/");
      if (mine && http && !isRoutes(file) && !file.endsWith("/guard.ts")) {
        found.push(`${file}: only routes and guards know HTTP (${spec})`);
      }
      if (mine && theirs && theirs !== mine) {
        const allowed =
          target === `modules/${theirs}/service.ts` ||
          target === `modules/${theirs}/guard.ts` ||
          (isSchema(file) && target && isSchema(target));
        if (!allowed) found.push(`${file}: reaches ${theirs} other than by its service (${spec})`);
        // A type-only import (a contract like JournalSource) is no dependency at run time.
        if (!isSchema(file) && !typeOnly)
          edges.set(mine, (edges.get(mine) ?? new Set()).add(theirs));
      }
      if (mine && target === "core/db/schema.ts") {
        for (const name of names) {
          const owner = owners.get(name) ?? "";
          const shared = owner.startsWith("adapters/") || owner.startsWith("core/");
          if (moduleOf(owner) !== mine && !shared) {
            found.push(`${file}: uses ${name}, a table of ${moduleOf(owner) ?? "?"}`);
          }
        }
      }
      if (file.startsWith("core/") && theirs && !(target && isSchema(target))) {
        found.push(`${file}: core uses no feature (${spec})`);
      }
    }
  }

  // Module cycles, by depth-first search.
  const state = new Map<string, "visiting" | "done">();
  const visit = (module: string, path: string[]) => {
    if (state.get(module) === "done") return;
    if (state.get(module) === "visiting") {
      found.push(`import cycle: ${[...path.slice(path.indexOf(module)), module].join(" → ")}`);
      return;
    }
    state.set(module, "visiting");
    for (const next of edges.get(module) ?? []) visit(next, [...path, module]);
    state.set(module, "done");
  };
  for (const module of edges.keys()) visit(module, []);

  return found;
}

async function apiSources(): Promise<Sources> {
  const sources: Sources = new Map();
  const root = join(import.meta.dir);
  for await (const path of new Bun.Glob("**/*.ts").scan(root)) {
    if (path.endsWith(".test.ts")) continue;
    sources.set(path, await Bun.file(join(root, path)).text());
  }
  return sources;
}

test("the API respects its import boundaries", async () => {
  const sources = await apiSources();
  expect(sources.size).toBeGreaterThan(30);
  expect(violations(sources)).toEqual([]);
});

describe("each rule catches its violation", () => {
  const base: [string, string][] = [
    ["core/db/schema.ts", 'export * from "../../modules/songs/schema";'],
    ["modules/songs/schema.ts", "export const songs = 1;"],
    ["modules/bands/schema.ts", "export const bands = 1;"],
  ];
  const check = (...files: [string, string][]) => violations(new Map([...base, ...files]));

  test("routes querying the database", () => {
    expect(check(["modules/songs/routes.ts", 'import { eq } from "drizzle-orm";'])).toHaveLength(1);
    expect(
      check(["modules/songs/routes.ts", 'import { songs } from "../../core/db/schema";']),
    ).toHaveLength(1);
  });

  test("a service importing Hono", () => {
    expect(check(["modules/songs/service.ts", 'import { Hono } from "hono";'])).toHaveLength(1);
    expect(
      check(["modules/bands/guard.ts", 'import { createMiddleware } from "hono/factory";']),
    ).toEqual([]);
  });

  test("reaching another module other than by its service", () => {
    expect(
      check(["modules/songs/service.ts", 'import { x } from "../bands/routes";']),
    ).toHaveLength(1);
    expect(check(["modules/songs/service.ts", 'import { x } from "../bands/service";'])).toEqual(
      [],
    );
  });

  test("using another module's table", () => {
    expect(
      check(["modules/songs/service.ts", 'import { bands, songs } from "../../core/db/schema";']),
    ).toEqual(["modules/songs/service.ts: uses bands, a table of bands"]);
  });

  test("core using a feature", () => {
    expect(check(["core/x.ts", 'import { y } from "../modules/songs/service";'])).toHaveLength(1);
  });

  test("an import cycle between modules, not by types only", () => {
    expect(
      check(
        ["modules/songs/service.ts", 'import { x } from "../bands/service";'],
        ["modules/bands/service.ts", 'import { y } from "../songs/service";'],
      ),
    ).toContain("import cycle: songs → bands → songs");
    expect(
      check(
        ["modules/songs/service.ts", 'import { x } from "../bands/service";'],
        ["modules/bands/service.ts", 'import type { Y } from "../songs/service";'],
      ),
    ).toEqual([]);
  });
});
