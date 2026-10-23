# CoverBand

An installable web app (PWA) for music bands: repertoire, setlists, gigs, members.
Multi-tenant: each band's data is private; a musician can belong to several bands.

Product briefs and technical decisions live in `briefs/`. Read them before making structural choices.
App-specific conventions: `apps/api/CLAUDE.md` and `apps/web/CLAUDE.md`. Task workflow (GitHub board, branches, PRs, releases): the `task-workflow` skill.

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
bun run dev          # API (http://localhost:3000) + web app (https://localhost:5173, proxies /api) + Drizzle Studio
bun run dev:lan      # same, reachable from a phone on the local network: prints a QR code (LAN IP override: DEV_HOST)
                     # (no service worker in dev: test installing and offline use with serve:lan)
bun run dev:api      # API only, watch mode
bun run dev:web      # web app only (Vite, plain http)
bun run build        # build the web app into apps/web/dist
bun run serve        # production-like: the API serves apps/web/dist on :3000 (open https://localhost:3000)
bun run serve:lan    # same, reachable from a phone on the local network: builds, then prints a QR code
                     # dev, dev:lan, serve and serve:lan use HTTPS when mkcert is installed (see Local HTTPS)
bun run format       # apply Biome formatting and safe fixes
bun test             # tests only (DB integration tests are skipped when DATABASE_URL is unset)
bun run e2e          # end-to-end tests (Playwright): builds and serves the app on :3100, needs db:up

cp .env.example .env # first time only
bun run db:up        # start local Postgres (port 5432), Mailpit (SMTP 1025, emails at http://localhost:8025)
                     # and Garage (S3 storage on http://localhost:3900, bucket and dev key created; web UI on :3909)
bun run db:generate  # generate a SQL migration from apps/api/src/core/db/schema.ts
bun run db:migrate   # apply pending migrations
bun run db:studio    # browse the database
bun run mail:test you@example.com fr   # send a test email (lands in Mailpit locally)
bun run db:down      # stop Postgres (add -v to docker compose down to wipe data)
```

## Local HTTPS

`dev`, `dev:lan`, `serve` and `serve:lan` serve HTTPS with a certificate from [mkcert](https://github.com/FiloSottile/mkcert) (#163): service workers (offline, install) and the screen wake lock need it on a phone. **Installing the app and offline use need the built app (`serve`, `serve:lan`):** the dev server (`dev`, `dev:lan`) has no service worker, on purpose (it would serve stale code while you edit). Without mkcert, they fall back to plain http with a warning. `dev:api`, `dev:web`, the end-to-end tests and CI stay on http.

- **Once per computer:** `sudo apt install mkcert libnss3-tools` (or `brew install mkcert nss`), then `mkcert -install` (a local certificate authority your browsers trust). Without `libnss3-tools` (`certutil`), mkcert only installs it in the system store, which Chrome and Firefox don't read on Linux.
  - **Chromium from snap** (Ubuntu's default) doesn't read it either (`net::ERR_CERT_AUTHORITY_INVALID`): copy `rootCA.pem` from `mkcert -CAROOT` to `~/Downloads` (the snap can't open hidden folders), then in `chrome://certificate-manager`, Local certificates › Custom › Installed by you › Trusted certificates › Import. Never `rootCA-key.pem`.
  - A "failed to fetch" after a certificate or server problem can come from what the app saved meanwhile: DevTools › Application › Storage › Clear site data, then reload.
- The scripts issue the certificate into `.certs/` (git-ignored) for `localhost` and, in the LAN modes, the LAN IP. It is issued again when the IP changes or mkcert's authority does (`apps/api/src/dev/tls.ts`).
- **Once per phone:** `dev:lan` and `serve:lan` print a second QR code, served over plain http on port 3080, that downloads mkcert's root certificate (`coverband-dev-ca.crt`).
  - **Android** (11 and later: tapping the file doesn't install it): in Settings, search "certificate", choose **CA certificate** (not "VPN & app user" nor "Wi-Fi"), "Install anyway", then pick the file in Downloads. The menus differ by brand: Pixel, Security & privacy › More security & privacy › Encryption & credentials › Install a certificate; Samsung, Security and privacy › More security settings › Install from device storage. A screen lock is required. Check it under Trusted credentials › User ("mkcert …"); if Chrome still warns, close it and open it again.
  - **iPhone:** install the downloaded profile (Settings › General › VPN & Device Management), then turn it on under General › About › Certificate Trust Settings.
  - An app installed from the LAN is tied to `https://<LAN IP>:<port>`: it stops opening when the IP changes or the certificate is removed. Uninstall it when done.
- **`rootCA-key.pem` (in `mkcert -CAROOT`) never leaves your computer:** a phone trusting this authority accepts any certificate signed with it. Remove the certificate from the phone when you no longer need it.
- Vite serves HTTPS in `dev` and passes `/api` on to the API over local http; in `serve`, the API serves HTTPS itself (`TLS_CERT_FILE`, `TLS_KEY_FILE`). No HSTS on `localhost` or an IP address (`wantsHsts`): it would force HTTPS on every localhost port. Mailpit stays on http.

## Deployment

- Branches: `dev` is the default branch (feature PRs, quick changes); `main` is production, protected, changed only through PRs (a release is a PR from `dev` to `main`). Details in the `task-workflow` skill.
- Every push to `main` whose CI passes is deployed to Scaleway by `.github/workflows/deploy.yml`: it builds the `Dockerfile` image, runs migrations, then rolls out the container. **Migrations run while the previous release still serves**: never break it in one step (add a column first, remove the old one in a later release).
- The infrastructure is code in `infra/` (OpenTofu, encrypted state in Object Storage): first setup and changes in `infra/README.md`. A new environment variable goes in `apps/api/src/env.ts`, `.env.example` and `infra/container.tf`, applied before merging the code that needs it.

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

- In `e2e/` (Playwright), files `*.e2e.ts` (so `bun test` skips them). They run against the production build served by the API on port 3100, never the dev servers, with the local Postgres, Mailpit and Garage, a fake LRCLIB (`e2e/fake-lrclib.ts`, port 3101) for lyrics searches, and fake music services (`e2e/fake-music.ts`, port 3103: Deezer, YouTube's API and thumbnails) for "Search and add"; CI runs them after the other checks.
- A phone in the system Chrome, locally and in CI (Playwright's own Chromium doesn't install on Ubuntu 26.04 yet; GitHub's runners ship Chrome), English, one worker, no retries. A story whose steps build on each other is a `serial` describe. Log in with `login()`: each login comes from its own client IP, so the suite stays under the login rate limit.
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
