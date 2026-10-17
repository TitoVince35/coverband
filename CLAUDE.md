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
- Tooling: Biome (lint + format), `tsc` for typechecking, `bun test`, Playwright for end-to-end tests (`e2e/`)

## Commands

```sh
bun install          # install all workspaces
bun run check        # lint + typecheck + tests (run before every commit)
bun run dev          # API (http://localhost:3000) + web app (http://localhost:5173, proxies /api) + Drizzle Studio
bun run dev:lan      # same, reachable from a phone on the local network: prints a QR code (LAN IP override: DEV_HOST)
bun run dev:api      # API only, watch mode
bun run dev:web      # web app only (Vite)
bun run build        # build the web app into apps/web/dist
bun run serve        # production-like: the API serves apps/web/dist on :3000 (open http://localhost:3000)
bun run format       # apply Biome formatting and safe fixes
bun test             # tests only (DB integration tests are skipped when DATABASE_URL is unset)
bun run e2e          # end-to-end tests (Playwright): builds and serves the app on :3100, needs db:up

cp .env.example .env # first time only
bun run db:up        # start local Postgres (port 5432), Mailpit (SMTP 1025, emails at http://localhost:8025)
                     # and Garage (S3 storage on http://localhost:3900, bucket and dev key created; web UI on :3909)
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
- **App name:** `APP_NAME` in `@coverband/shared` (currently "Coverband Beta") is the only place it is written: use the constant in code and `{{appName}}` in translations, never a literal.
- **i18n from day one:** English (default and fallback) and French, in the web app and in emails. Never hardcode user-visible text. Supported languages: `LANGUAGES` in `@coverband/shared`.
- **Vocabulary (all languages, UI and emails):** "band leader" is never translated (French: "un band leader", never "leader" alone or "chef de groupe"). Musicians' terms like "setlist" also stay as they are. In French, a musician (the band role) is « zicos » (invariable, gender-neutral): « un zicos », « Inviter un zicos ». In French, prefer gender-neutral wording ("envoyée par", "membre depuis") over a masculine default.
- **Accounts:** no public sign-up; accounts only come from invitations. Global role on the user (`admin` / `user`); band roles (`leader` / `musician`) live on the band membership, never on the user.
- **Multi-tenancy:** every band-scoped table has a `band_id`; every band-scoped request checks that the user is a member of that band (non-members get a 404). The band is in the URL (`/b/:bandSlug/...`). **A band name is forever** (it is also the URL): it can't be renamed, only the genre changes.
- **Stateless server** (it runs on serverless containers): no in-memory sessions or caches that matter, no local file storage, no in-process cron. Sessions in Postgres, files in object storage (Garage locally, Scaleway Object Storage in production).

## End-to-end tests

- In `e2e/` (Playwright), files `*.e2e.ts` (so `bun test` skips them). They run against the production build served by the API on port 3100, never the dev servers, with the local Postgres, Mailpit and Garage; CI runs them after the other checks.
- A phone in Chromium (the system Chrome locally: Playwright's own doesn't install on Ubuntu 26.04 yet), English, one worker, no retries. A story whose steps build on each other is a `serial` describe. Log in with `login()`: each login comes from its own client IP, so the suite stays under the login rate limit.
- Test data comes from the real flows: the global setup creates this run's admin, who invites; links are read from Mailpit (`invitationLink()`). Everything created is marked (`@e2e.localhost` emails, "E2E " band names) and the teardown deletes it from the database and Mailpit, leftovers of interrupted runs included. Only an avatar file can stay in the local bucket, if the avatar test fails between upload and removal.
- Select by role and visible text, in English, like a user would.

## Briefs

They track the product scaffolding and the design decisions made along the way. Every document has a human-readable timestamp line right after its title, separated by blank lines: `> 🕒 Brief posted on Thursday 2026/03/26 14:44` (Vince's) or `> 🕒 Study posted on ...` (Claude's), in English, local time.

- `briefs/vince/NNN_title.md`: Vince's briefs. Vince writes them without the timestamp line; Claude adds it when asked to review the brief, using the time of that request.
- `briefs/claude/NNN_title.md`: Claude's proposals and answers, numbered in their own sequence (not matched to Vince's numbers).
- Only save a reply to `briefs/claude/` when Vince explicitly asks.
- A Vince brief's timestamp block grows with its life cycle, one line per step, same format, separated by `>` lines:

  ```md
  > 🕒 Brief posted on Friday 2026/10/16 18:04
  >
  > 🕒 Brief settled on Friday 2026/10/16 18:30
  >
  > 🕒 Issues completed on Friday 2026/10/30 11:12
  ```

  - **Settled:** added when Vince declares the brief settled (decisions made), with the time of that request.
  - **Issues:** when planning a brief creates issues, list them in an `## Issues` section at the end of the Vince brief, one link per issue with its title: `- [#42 Structured logging](https://github.com/TitoVince35/coverband/issues/42)`.
  - **Issues completed:** added once every issue in that list is closed, with the time the last one was closed.
