# API (`apps/api`)

Hono on Bun. Cross-cutting rules are in the root `CLAUDE.md`.

## Routes

- REST under `/api` (resource URLs, HTTP verbs, status codes, JSON). No OpenAPI for now.
- One Hono sub-app per resource in `src/routes/`, built by a function taking `AppDeps` (auth, db, mailer, appUrl) and mounted in `src/app.ts` with **chained calls** so `AppType` keeps every route. The web app calls it through the typed client from `@coverband/api/client` (Hono calls this "RPC"; see `briefs/claude/003_rest-vs-rpc.md`).
- Validate input with `zValidator(..., validationHook)` (`src/validation.ts`: invalid input becomes a 400 `bad_request`).
- Send errors with `apiError()` (`src/errors.ts`). It keeps the status as a literal type, so `ensureOk(res)` in the web app narrows typed-client responses to their success body.
- Guards: `requireUser` / `requireAdmin` (`src/middleware/session.ts`, read `c.var.user`). Band routes live under `/api/bands/:bandSlug` with `requireMember(db)` (`src/middleware/band.ts`: sets `c.var.band` and `c.var.membership`, 404 for non-members); band leader actions add `requireLeader` (403).
- Tests build dependencies with `createTestDeps()` (`src/test-deps.ts`, memory mailer).

## Database

- Postgres goes through Scaleway's connection pooler: use the `postgres` driver with `prepare: false` (`src/db/client.ts`).
- Drizzle uses `casing: "snake_case"`: write camelCase in TypeScript, get snake_case columns.
- Commit generated migrations in `drizzle/`; never edit an applied one.
- Environment variables are validated with Zod in `src/env.ts`; add new ones there and in `.env.example`.

## Authentication

- Better Auth in `src/auth.ts`, mounted at `/api/auth/*`. Email + password, sessions in Postgres, password policy from `@coverband/shared` (`PASSWORD_MIN_LENGTH`). Admin plugin for the global role.
- Tables in `src/db/auth-schema.ts` were generated with `npx auth generate`, then adapted: when adding a Better Auth plugin, regenerate and compare.
- The default admin is created at startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD` only if missing (`src/bootstrap.ts`).
- Users have `firstName`, `lastName`, `nickname`; Better Auth's `name` holds the display name (`displayName()`).

## Invitations and onboarding

- `src/invitations.ts` is the only way to get an account. Role `leader` (creates a band, sent by an admin) or `musician` (joins a band, sent by that band's leader).
- Functions take an `InvitationScope` (`LEADER_INVITATIONS` or the musicians of one band), so an id from another scope is not found.
- Only the token's SHA-256 hash is stored. If the email can't be sent, the invitation is deleted.
- Accepting goes through the public `/api/invitations/:token` routes and `src/onboarding.ts`: everything (account if new, band, membership, invitation consumed) in **one transaction, nothing before the last wizard step**. A new account is created with Better Auth's password hasher and the `credential` account shape, then logged in. Someone who already has an account must be logged in as the invited email.

## Bands

Name and slug logic in `src/bands.ts` (renaming changes the slug, so the URL). Band names are unique case-insensitively; the slug comes from `slugify` in `@coverband/shared`.

## Emails

- Sent over SMTP by a `Mailer` (`src/mail/mailer.ts`): Mailpit locally, Scaleway TEM in production, so the provider is only `SMTP_*` configuration.
- One function per email in `src/mail/templates.ts` returning an `EmailContent` per language (`Record<Language, ...>`, so a missing translation fails the typecheck), rendered by `renderEmail` (`src/mail/layout.ts`: inline-styled HTML + plain text, every value escaped).
- Send an email in the recipient's language.
- Tests use `createMemoryMailer()`; the Mailpit integration test runs when `MAILPIT_URL` is set (locally and in CI).
