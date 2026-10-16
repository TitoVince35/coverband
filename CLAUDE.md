# CoverBand

An installable web app (PWA) for music bands: repertoire, setlists, gigs, members.
Multi-tenant: each band's data is private; a musician can belong to several bands.

Product briefs and technical decisions live in `briefs/`. Read them before making structural choices.
App-specific conventions: `apps/api/CLAUDE.md` and `apps/web/CLAUDE.md`. Task workflow (GitHub board, branches, PRs): the `task-workflow` skill.

## Stack

- **Bun** workspaces monorepo, TypeScript strict everywhere
- `apps/api`: Hono on Bun, REST API under `/api` plus the built web app (single container)
- `apps/web`: React + Vite + TanStack Router/Query, Tailwind + shadcn/ui, vite-plugin-pwa
- `packages/shared`: code shared by both apps (Zod schemas, types, helpers)
- PostgreSQL + **Drizzle** ORM, **Better Auth** (organization plugin: band = organization)
- Hosting: Scaleway (Paris), Serverless Containers + Serverless SQL Database + Object Storage
- Tooling: Biome (lint + format), `tsc` for typechecking, `bun test`, Playwright for end-to-end tests

## Commands

```sh
bun install          # install all workspaces
bun run check        # lint + typecheck + tests (run before every commit)
bun run dev          # API (http://localhost:3000) + web app (http://localhost:5173, proxies /api)
bun run dev:api      # API only, watch mode
bun run dev:web      # web app only (Vite)
bun run build        # build the web app into apps/web/dist
bun run serve        # production-like: the API serves apps/web/dist on :3000 (open http://localhost:3000)
bun run format       # apply Biome formatting and safe fixes
bun test             # tests only (DB integration tests are skipped when DATABASE_URL is unset)

cp .env.example .env # first time only
bun run db:up        # start local Postgres (port 5432) and Mailpit (SMTP 1025, emails at http://localhost:8025)
bun run db:generate  # generate a SQL migration from apps/api/src/db/schema.ts
bun run db:migrate   # apply pending migrations
bun run db:studio    # browse the database
bun run mail:test you@example.com fr   # send a test email (lands in Mailpit locally)
bun run db:down      # stop Postgres (add -v to docker compose down to wipe data)
```

## Conventions

- Code, comments, commits, issues and PRs in English.
- Tests sit next to the code: `foo.ts` → `foo.test.ts`, using `bun:test`.
- Workspace packages are imported by name (`@coverband/shared`), never by relative path across packages.
- **API errors** are JSON `{ "error": { "code", "message" } }`: `code` is a stable code from `ERROR_CODES` in `@coverband/shared` that the web app translates (a new code needs a translation in both locale files, tested); `message` is an English fallback for developers.
- **i18n from day one:** English (default and fallback) and French, in the web app and in emails. Never hardcode user-visible text. Supported languages: `LANGUAGES` in `@coverband/shared`.
- **Vocabulary (all languages, UI and emails):** "band leader" is never translated (French: "un band leader", never "leader" alone or "chef de groupe"). Musicians' terms like "setlist" also stay as they are. In French, prefer gender-neutral wording ("envoyée par", "membre depuis") over a masculine default.
- **Accounts:** no public sign-up; accounts only come from invitations. Global role on the user (`admin` / `user`); band roles (`leader` / `musician`) live on the band membership, never on the user.
- **Multi-tenancy:** every band-scoped table has a `band_id`; every band-scoped request checks that the user is a member of that band (non-members get a 404). The band is in the URL (`/b/:bandSlug/...`).
- **Stateless server** (it runs on serverless containers): no in-memory sessions or caches that matter, no local file storage, no in-process cron. Sessions in Postgres, files in object storage.

## Briefs

They track the product scaffolding and the design decisions made along the way. Every document starts with a human-readable timestamp line, then a blank line: `Brief posted on Thursday 2026/03/26 14:44` (Vince's) or `Study posted on ...` (Claude's), in English, local time.

- `briefs/vince/NNN_title.md`: Vince's briefs.
- `briefs/claude/NNN_title.md`: Claude's proposals and answers, numbered in their own sequence (not matched to Vince's numbers).
- Only save a reply to `briefs/claude/` when Vince explicitly asks.
