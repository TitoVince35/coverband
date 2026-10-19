# API (`apps/api`)

Hono on Bun. Cross-cutting rules are in the root `CLAUDE.md`.

## Layout

- `src/modules/<feature>/`: one folder per feature (admin, bands, members, instruments, invitations, onboarding, profile, journal, songs). `routes.ts` (Hono sub-app), `service.ts` (the feature's rules and queries, its transactions and activity), `schema.ts` (its Drizzle tables, when it has some), tests next to them.
- `src/core/`: what every feature uses, knowing none of them: `errors.ts`, `db/` (client, migrations runner, `schema.ts` re-exporting every table for Drizzle), `http/` (session guards, validation, rate limiter, security, health), `activity/` (recording events).
- `src/adapters/`: the outside world behind small interfaces: `auth.ts` (Better Auth, with its tables in `auth-schema.ts`), `storage.ts`, `mail/`.
- `src/app.ts` is the composition root: it mounts every module's sub-app (a band's features under `/bands/:bandSlug/...`). `src/main.ts` builds the real dependencies and starts the server.
- Rules, checked by `src/architecture.test.ts` (so by `bun run check`): routes call their module's service and never query the database; only routes and guards import Hono; a module uses another one only through its `service.ts` (or the bands `guard.ts`), and only its own tables plus the auth adapter's (`users`...) and core's (`activity`); `core/` uses no feature; no import cycle between modules. When a module needs another one's data, add a function to that module's service rather than an exception to the check.
- **Moving or renaming files:** see the `task-workflow` skill (move-only commits).

## Routes

- REST under `/api` (resource URLs, HTTP verbs, status codes, JSON). No OpenAPI for now.
- One Hono sub-app per resource, in its module's `routes.ts`, built by a function taking `AppDeps` (`src/deps.ts`: auth, db, mailer, storage, appUrl) and mounted in `src/app.ts` with **chained calls** so `AppType` keeps every route. The web app calls it through the typed client from `@coverband/api/client` (Hono calls this "RPC"; see `briefs/claude/003_rest-vs-rpc.md`).
- Routes don't query the database (no `drizzle-orm` or `db/schema` import): they validate, call their module's service and shape the response.
- Validate input with `zValidator(..., validationHook)` (`src/core/http/validation.ts`: invalid input becomes a 400 `bad_request`). Request bodies are Zod schemas in `@coverband/shared/schemas` (shared with the web app; a separate entry so Zod stays out of the web bundle until it uses one); route params and queries stay in the routes.
- Send errors with `apiError()` (`src/core/errors.ts`). It keeps the status as a literal type, so `ensureOk(res)` in the web app narrows typed-client responses to their success body.
- **Domain refusals** (a duplicate, an expired invitation...) are thrown as an `AppError(code, message, details?)`, or a subclass named after the case (`DuplicateSongError`). The domain never knows HTTP statuses: `ERROR_STATUS` (`src/core/errors.ts`) gives each code its status, and the app's `onError` sends the JSON error. Routes don't catch them. A new code goes in `ERROR_CODES`, `ERROR_STATUS` (the typecheck asks) and both web locales.
- Postgres refusals are recognised with `isForeignKeyViolation` / `isUniqueViolation(error, constraint)` (`src/core/db/pg-errors.ts`).
- Guards: `requireUser` / `requireAdmin` (`src/core/http/session.ts`). They are typed so the routes after them read a non-null `c.var.user`: never fall back to `?? ""`. A band's features are sub-apps mounted under `/api/bands/:bandSlug/<feature>` in `src/app.ts`, each starting with `.use(requireMember(db))` (`src/modules/bands/guard.ts`: sets `c.var.band` and `c.var.membership`, 404 for non-members), so the guard runs once per request. Band leader actions add `requireLeader` (403).
- Tests build dependencies with `createTestDeps()` (`src/test-deps.ts`, memory mailer and storage).

## Security

- Security headers on every response, API and web app (`src/core/http/security.ts`, Hono's `secureHeaders`): CSP, `Referrer-Policy: no-referrer` (tokens are in invitation and reset URLs), `X-Frame-Options: DENY`, a `Permissions-Policy` turning off camera, microphone and geolocation; HSTS only when `BETTER_AUTH_URL` is HTTPS.
- The CSP only allows our own origin. The inline theme script of `apps/web/index.html` is allowed by its hash (`THEME_SCRIPT_HASH`): when the script changes, the test fails and shows the new hash. Inline styles stay allowed (React style props, toasts). Anything loaded from another origin (fonts, images, scripts) needs a CSP change.
- Guards on `/api/*`, Better Auth included (`requestGuards`): request bodies up to 100 KB (413 otherwise; files will go straight to Object Storage), and `hono/csrf`, which refuses form-style requests (form, multipart, `text/plain`) from other origins than the app URL and `TRUSTED_ORIGINS`.
- Rate limits. Better Auth limits its own endpoints per client IP (login and password change: 3 per 10 s; reset requests: 3 per minute; others: 100 per 10 s), with counters in Postgres. Our routes that send emails use `rateLimitUser(db, rule)` (`src/core/http/rate-limit.ts`, fixed window per user, stored in the same `rate_limits` table with `coverband:` keys): invitation send and resend, 20 per hour (`INVITATION_EMAILS`, `src/modules/invitations/routes.ts`). Over the limit: 429 `too_many_requests` with `Retry-After`.
- Client IP: Better Auth reads `X-Forwarded-For`. A header with several addresses is only trusted when the proxies are listed in `TRUSTED_PROXIES`; otherwise every client would share one rate limit bucket. Check it on deployment (#8): look at the header, log in, and check `sessions.ip_address` holds your IP.
- **No CORS, on purpose.** The API serves the web app on the same origin in production, and Vite proxies `/api` in development. CORS would only loosen the browser's cross-origin rules: never add it.

## Database

- Postgres goes through Scaleway's connection pooler: use the `postgres` driver with `prepare: false` (`src/core/db/client.ts`).
- Drizzle uses `casing: "snake_case"`: write camelCase in TypeScript, get snake_case columns.
- Commit generated migrations in `drizzle/`; never edit an applied one.
- Environment variables are validated with Zod in `src/env.ts`; add new ones there and in `.env.example`.

## Activity

- **Every write records its event** in the `activity` table (`src/core/activity/schema.ts`): base for stats and the future activity feed. A new feature adds its codes to `ACTIVITY_ACTIONS` (and targets to `ACTIVITY_TARGETS`) in `@coverband/shared`; codes never change once used.
- Call `recordActivity(tx, ...)` (`src/core/activity/record.ts`) with the transaction of the change itself: no event without its change, no change without its event. Refused or failed attempts record nothing.
- `band_id` is null for events outside a band (band leader invitations, new accounts); band activity is deleted with its band. `actor_id` becomes null when the account is deleted.
- `data` holds small, non-personal details: IDs, roles, codes, a genre. **Never emails or names.**
- Invitations record `invitation.sent` only once the email has gone out, since a failed send deletes the invitation.
- **Band journal:** `GET /api/bands/:bandSlug/activity` (`bandJournal`, `src/modules/journal/service.ts`, members only): the band's latest `JOURNAL_SIZE` (10) events, newest first, with the actor's current display name (null once deleted) and only the details a sentence needs (`JournalDetails`: a song's title, its new status, the new genre); a leader's `member.joined` is left out (`band.created` says it). The journal knows no feature: each module gives a `JournalSource` for its target type (`modules/songs/journal.ts`, `modules/bands/journal.ts`), passed to `journalRoutes` in `src/app.ts`. A new feature with journal entries adds its source there. The web app gives each action a sentence (`src/components/band/band-journal.tsx`): a new band event needs one in both locales, or it isn't shown.
- Tests check the events with `activityOf(db, targetId)` (`src/test-deps.ts`) and delete the activity outside a band of their test users.

## Authentication

- Better Auth in `src/adapters/auth.ts`, mounted at `/api/auth/*`. Email + password, sessions in Postgres, password policy from `@coverband/shared` (`PASSWORD_MIN_LENGTH`). Admin plugin for the global role.
- Tables in `src/adapters/auth-schema.ts` were generated with `npx auth generate`, then adapted: when adding a Better Auth plugin, regenerate and compare.
- The default admin is created at startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD` only if missing (`src/bootstrap.ts`).
- Users have `firstName`, `lastName`, `nickname`; Better Auth's `name` holds the display name (`displayName()`). Better Auth keeps them read-only (`input: false`): users change them with `PATCH /api/me` (`src/modules/profile/routes.ts`, `src/modules/profile/service.ts`), which recomputes `name`. Better Auth's `/update-user` is disabled (`disabledPaths`): it would let users set `name` freely and write `image`, which holds a storage key only the server may write.
- Password reset (`/request-password-reset`, `/reset-password`): the email's link (1 h, single use) goes through Better Auth's `/api/auth/reset-password/:token`, which redirects to the web app's `/reset-password?token=` or `?error=INVALID_TOKEN`. The email is in the request's `Accept-Language` (the web app sends its language). The answer is the same whether the email has an account or not (only the response time differs, an accepted leak). A reset revokes every session; `/change-password` is called with `revokeOtherSessions`.

## Invitations and onboarding

- `src/modules/invitations/service.ts` is the only way to get an account. Role `leader` (creates a band, sent by an admin) or `musician` (joins a band, sent by that band's leader).
- Functions take an `InvitationScope` (`LEADER_INVITATIONS` or the musicians of one band), so an id from another scope is not found.
- Only the token's SHA-256 hash is stored. If the email can't be sent, the invitation is deleted.
- Accepting goes through the public `/api/invitations/:token` routes and `src/modules/onboarding/service.ts`: everything (account if new, band, membership, invitation consumed) in **one transaction, nothing before the last wizard step**. Onboarding owns no table: it calls each module's service with its transaction (`lockPendingInvitation` / `consumeInvitation`, `createAccount`, `createBand`, `addMember`), and each records its own event. A new account is created with Better Auth's password hasher and the `credential` account shape, then logged in. Someone who already has an account must be logged in as the invited email.

## Bands

Name and slug logic in `src/modules/bands/service.ts`. Band names are unique case-insensitively; the slug comes from `slugify` in `@coverband/shared`.

Instruments are per band membership (`member_instruments`, `src/modules/instruments/service.ts`): an ordered list (the first is the main one) of known codes or free text, never both (a database check). Values are always cleaned with `cleanInstruments` (`parseInstrument` from `@coverband/shared`: free text matching a known instrument becomes its code, unknown codes become free text, duplicates dropped, at most `MAX_INSTRUMENTS`). Members change only their own (`PUT /api/bands/:bandSlug/members/me/instruments`). Free text used in at least two bands is suggested to everyone (`GET /api/instruments/suggestions`); one band's own labels never are.

## Songs

A band's repertoire (`songs`, `src/modules/songs/service.ts`, routes in `src/modules/songs/routes.ts` under `/api/bands/:bandSlug/songs`): every member lists, adds and edits songs. Title and artist identify a song **without a unique constraint**: a song matching another one of the band (`findDuplicateSong` / `songKey` from `@coverband/shared`: case, accents, punctuation and spaces ignored) is refused with 409 `song_duplicate` unless the request sends `confirmDuplicate: true`, which the web app asks for ("add anyway"). An edit is only checked when its title or artist changes. Durations are seconds (`standardDuration`: the original, `ownDuration`: the band's), typed as `m:ss` (`parseDuration`). Details (#89), all optional: `key` and `bandKey` (codes from `MUSICAL_KEYS`: 12 major, 12 minor, spelled as usual, shown with `keyLabel` / `keyShort`), `tempo` (BPM, `SONG_TEMPO`), `style` and `notes` (free text, blank is null). Status and energy (#90): `status` (`SONG_STATUSES`: proposed → learning → ready, a Postgres enum, new songs are proposed) and `energy` (1 to `MAX_ENERGY` = 3 peppers, null: not rated), one band-wide value each. A new status records its own `song.status_changed` (data: the status code, which the journal returns); other changed fields go in `song.updated`. Archive and delete (#91): any member archives and restores (`POST …/archive`, `…/restore`, `archived_at`; `GET …/songs?archived=true` lists them; archived songs don't count as duplicates); a band leader deletes for good (`DELETE …/songs/:songId`). **Whatever uses a song (setlists) must reference it with a foreign key that refuses deletion (`on delete restrict`)**: `deleteSong` turns that refusal into 409 `song_in_use` ("archive it instead"). Events `song.archived`, `song.restored`, `song.deleted`; a deleted song's journal entries say "a song". Links (#92, `song_media`, `src/modules/songs/media.service.ts`): `POST /…/songs/:songId/media`, `PATCH` / `DELETE …/media/:mediaId`, returned with the song (`GET …/songs/:songId`, oldest first); http(s) URLs only (`parseMediaUrl`), an optional title, instruments cleaned with `cleanInstruments`, at most `MEDIA_LIMITS.perSong`. The provider isn't stored: `mediaProvider(url)` reads it from the domain, so new providers apply to older links. Each change records `song.updated` with `fields: "media"`. Activity: `song.added`, `song.updated` (with the names of the changed fields); the journal shows the song's current title.

## Files

- Object storage through a `Storage` (`src/adapters/storage.ts`, `AppDeps.storage`): `put`, `get` (a stream, or null), `delete`. Bun's built-in S3 client, no SDK. Garage locally (`docker/garage/`, started and prepared by `bun run db:up`, also in CI), Scaleway Object Storage in production: only `S3_*` configuration. Setting up the Scaleway bucket and its key is a production setup step (#8).
- The bucket is private: files are served by API routes that check who may see them, never by public bucket URLs.
- Keys are paths with a fresh UUID per version (`users/{id}/avatar/{uuid}.webp`): a new file gets a new key, and the old object is deleted.
- Tests use `createMemoryStorage()`; the S3 integration test runs when `S3_ENDPOINT` is set (locally and in CI).
- **Avatars** (`src/modules/profile/avatars.ts`): `PUT` / `DELETE /api/me/avatar` (raw body, the browser has already cropped and resized it; WebP or JPEG, checked by the first bytes, never the declared type) and `GET /api/users/:id/avatar` (the user, admins and band mates, 404 for anyone else). `users.image` holds the storage key; `avatarUrl()` from `@coverband/shared` turns it into the versioned URL, cached for good.

## Emails

- Sent over SMTP by a `Mailer` (`src/adapters/mail/mailer.ts`): Mailpit locally, Scaleway TEM in production, so the provider is only `SMTP_*` configuration.
- One function per email in `src/adapters/mail/templates.ts` returning an `EmailContent` per language (`Record<Language, ...>`, so a missing translation fails the typecheck), rendered by `renderEmail` (`src/adapters/mail/layout.ts`: inline-styled HTML + plain text, every value escaped).
- Send an email in the recipient's language.
- Tests use `createMemoryMailer()`; the Mailpit integration test runs when `MAILPIT_URL` is set (locally and in CI).
