---
name: db-diagram
description: Draw CoverBand's database model from the Drizzle schema and publish it as a claude.ai artifact page (zoomable, light and dark). Use when asked for the database diagram, the DB model or schema as an artifact or page, or to refresh the published one after a schema change.
---

# Database diagram artifact

1. **Draw:** `bun run db:diagram` (needs Graphviz: `sudo apt install graphviz`). It writes `doc/schemas/YYmmddhhmm_db-diagram.{pdf,svg,dot}`; the PDF and SVG are committed, the `.dot` is git-ignored.
2. **Build the page:** `bun run db:diagram:page`. It wraps the latest `doc/schemas/*_db-diagram.svg` into `doc/schemas/YYmmddhhmm_db-diagram.html` (git-ignored): legend, group chips, counts, zoom and drag, light and dark themes (`apps/api/src/dev/db-diagram-page.ts`). Pass an SVG path to build an older one.
3. **Publish** that HTML file with the Artifact tool, **updating the existing artifact** so its link stays the same: `url: https://claude.ai/artifact/9KQRrUqUZEiou2enWe4am3` (from another conversation, `read` it first, as the tool asks). Create a new artifact only when asked; then give it `icon: "database"` and a one-sentence description, and replace the URL above.
4. Tell Vince the link, the counts shown on the page (tables, foreign keys, groups) and which files `db:diagram` added to `doc/schemas/` (left uncommitted, as usual).

## When the page looks wrong

- The page re-skins Graphviz's literal colors with CSS selectors on them (`#5f6368`, `#1a73e8`, `#3c4043`, `white`, `black`) and finds the groups by `<title>cluster_…</title>`. Changing those colors or the node shapes in `apps/api/src/dev/db-diagram.ts` needs the matching change in `db-diagram-page.ts`.
- A new module in `MODULES` (`db-diagram.ts`) gets a group color from `COLORS`; its dark tint is computed (`darkTint`), nothing to add.
