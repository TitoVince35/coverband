# API (`apps/api`)

Hono on Bun. Cross-cutting rules are in the root `CLAUDE.md`.

## Routes

- REST under `/api` (resource URLs, HTTP verbs, status codes, JSON). No OpenAPI for now.
- One Hono sub-app per resource in `src/routes/`, built by a function taking `AppDeps` (auth, db, mailer, appUrl) and mounted in `src/app.ts` with **chained calls** so `AppType` keeps every route. The web app calls it through the typed client from `@coverband/api/client` (Hono calls this "RPC"; see `briefs/claude/003_rest-vs-rpc.md`).
- Validate input with `zValidator(..., validationHook)` (`src/validation.ts`: invalid input becomes a 400 `bad_request`).
- Send errors with `apiError()` (`src/errors.ts`). It keeps the status as a literal type, so `ensureOk(res)` in the web app narrows typed-client responses to their success body.
- Guards: `requireUser` / `requireAdmin` (`src/middleware/session.ts`, read `c.var.user`). Band routes live under `/api/bands/:bandSlug` with `requireMember(db)` (`src/middleware/band.ts`: sets `c.var.band` and `c.var.membership`, 404 for non-members); band leader actions add `requireLeader` (403).
- Tests build dependencies with `createTestDeps()` (`src/test-deps.ts`, memory mailer and storage).

## Security

- Security headers on every response, API and web app (`src/middleware/security.ts`, Hono's `secureHeaders`): CSP, `Referrer-Policy: no-referrer` (tokens are in invitation and reset URLs), `X-Frame-Options: DENY`, a `Permissions-Policy` turning off camera, microphone and geolocation; HSTS only when `BETTER_AUTH_URL` is HTTPS.
- The CSP only allows our own origin. The inline theme script of `apps/web/index.html` is allowed by its hash (`THEME_SCRIPT_HASH`): when the script changes, the test fails and shows the new hash. Inline styles stay allowed (React style props, toasts). Anything loaded from another origin (fonts, images, scripts) needs a CSP change.
- Guards on `/api/*`, Better Auth included (`requestGuards`): request bodies up to 100 KB (413 otherwise; files will go straight to Object Storage), and `hono/csrf`, which refuses form-style requests (form, multipart, `text/plain`) from other origins than the app URL and `TRUSTED_ORIGINS`.
- Rate limits. Better Auth limits its own endpoints per client IP (login and password change: 3 per 10 s; reset requests: 3 per minute; others: 100 per 10 s), with counters in Postgres. Our routes that send emails use `rateLimitUser(db, rule)` (`src/middleware/rate-limit.ts`, fixed window per user, stored in the same `rate_limits` table with `coverband:` keys): invitation send and resend, 20 per hour (`INVITATION_EMAILS`). Over the limit: 429 `too_many_requests` with `Retry-After`.
- Client IP: Better Auth reads `X-Forwarded-For`. A header with several addresses is only trusted when the proxies are listed in `TRUSTED_PROXIES`; otherwise every client would share one rate limit bucket. Check it on deployment (#8): look at the header, log in, and check `sessions.ip_address` holds your IP.
- **No CORS, on purpose.** The API serves the web app on the same origin in production, and Vite proxies `/api` in development. CORS would only loosen the browser's cross-origin rules: never add it.

## Database

- Postgres goes through Scaleway's connection pooler: use the `postgres` driver with `prepare: false` (`src/db/client.ts`).
- Drizzle uses `casing: "snake_case"`: write camelCase in TypeScript, get snake_case columns.
- Commit generated migrations in `drizzle/`; never edit an applied one.
- Environment variables are validated with Zod in `src/env.ts`; add new ones there and in `.env.example`.

## Activity

- **Every write records its event** in the `activity` table (`src/db/activity-schema.ts`): base for stats and the future activity feed. A new feature adds its codes to `ACTIVITY_ACTIONS` (and targets to `ACTIVITY_TARGETS`) in `@coverband/shared`; codes never change once used.
- Call `recordActivity(tx, ...)` (`src/activity.ts`) with the transaction of the change itself: no event without its change, no change without its event. Refused or failed attempts record nothing.
- `band_id` is null for events outside a band (band leader invitations, new accounts); band activity is deleted with its band. `actor_id` becomes null when the account is deleted.
- `data` holds small, non-personal details: IDs, roles, codes, a genre. **Never emails or names.**
- Invitations record `invitation.sent` only once the email has gone out, since a failed send deletes the invitation.
- Tests check the events with `activityOf(db, targetId)` (`src/test-deps.ts`) and delete the activity outside a band of their test users.

## Authentication

- Better Auth in `src/auth.ts`, mounted at `/api/auth/*`. Email + password, sessions in Postgres, password policy from `@coverband/shared` (`PASSWORD_MIN_LENGTH`). Admin plugin for the global role.
- Tables in `src/db/auth-schema.ts` were generated with `npx auth generate`, then adapted: when adding a Better Auth plugin, regenerate and compare.
- The default admin is created at startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD` only if missing (`src/bootstrap.ts`).
- Users have `firstName`, `lastName`, `nickname`; Better Auth's `name` holds the display name (`displayName()`). Better Auth keeps them read-only (`input: false`): users change them with `PATCH /api/me` (`src/routes/me.ts`, `src/profile.ts`), which recomputes `name`.
- Password reset (`/request-password-reset`, `/reset-password`): the email's link (1 h, single use) goes through Better Auth's `/api/auth/reset-password/:token`, which redirects to the web app's `/reset-password?token=` or `?error=INVALID_TOKEN`. The email is in the request's `Accept-Language` (the web app sends its language). The answer is the same whether the email has an account or not (only the response time differs, an accepted leak). A reset revokes every session; `/change-password` is called with `revokeOtherSessions`.

## Invitations and onboarding

- `src/invitations.ts` is the only way to get an account. Role `leader` (creates a band, sent by an admin) or `musician` (joins a band, sent by that band's leader).
- Functions take an `InvitationScope` (`LEADER_INVITATIONS` or the musicians of one band), so an id from another scope is not found.
- Only the token's SHA-256 hash is stored. If the email can't be sent, the invitation is deleted.
- Accepting goes through the public `/api/invitations/:token` routes and `src/onboarding.ts`: everything (account if new, band, membership, invitation consumed) in **one transaction, nothing before the last wizard step**. A new account is created with Better Auth's password hasher and the `credential` account shape, then logged in. Someone who already has an account must be logged in as the invited email.

## Bands

Name and slug logic in `src/bands.ts`. Band names are unique case-insensitively; the slug comes from `slugify` in `@coverband/shared`.

## Files

- Object storage through a `Storage` (`src/storage.ts`, `AppDeps.storage`): `put`, `get` (a stream, or null), `delete`. Bun's built-in S3 client, no SDK. Garage locally (`docker/garage/`, started and prepared by `bun run db:up`, also in CI), Scaleway Object Storage in production: only `S3_*` configuration. Setting up the Scaleway bucket and its key is a production setup step (#8).
- The bucket is private: files are served by API routes that check who may see them, never by public bucket URLs.
- Keys are paths with a fresh UUID per version (`users/{id}/avatar/{uuid}.webp`): a new file gets a new key, and the old object is deleted.
- Tests use `createMemoryStorage()`; the S3 integration test runs when `S3_ENDPOINT` is set (locally and in CI).

## Emails

- Sent over SMTP by a `Mailer` (`src/mail/mailer.ts`): Mailpit locally, Scaleway TEM in production, so the provider is only `SMTP_*` configuration.
- One function per email in `src/mail/templates.ts` returning an `EmailContent` per language (`Record<Language, ...>`, so a missing translation fails the typecheck), rendered by `renderEmail` (`src/mail/layout.ts`: inline-styled HTML + plain text, every value escaped).
- Send an email in the recipient's language.
- Tests use `createMemoryMailer()`; the Mailpit integration test runs when `MAILPIT_URL` is set (locally and in CI).
