# 013 - API architecture: audit and refactor proposal

> 🕒 Study posted on Monday 2026/10/19 10:48

Answer to [013_api-architecture](../vince/013_api-architecture.md). Audit of `apps/api` (about 3,500 lines) against two criteria, modularity and clean architecture, then a target structure and a migration plan.

## What's already good

Keep these through any refactor:

- **Dependency injection at the edges.** `AppDeps`, `Mailer` and `Storage` are interfaces with SMTP/S3 and in-memory versions, and `createApp` is a pure factory. That covers the "ports and adapters" idea for the outside world.
- **Business rules mostly live outside the routes.** `songs.ts`, `invitations.ts`, `onboarding.ts` and `avatars.ts` hold the rules and the transactions, and the routes are mostly thin.
- **The transaction + activity rule** (`recordActivity(tx, …)`) is applied the same way everywhere.
- **Scoping by type** (`InvitationScope`, `Member = { bandId, userId }`) makes it hard to reach another band's data.

So this is a structure that has started to drift as features piled up. It isn't a rewrite case.

## Findings

### Modularity

1. **One folder split by technical layer, not by feature.** Songs live in `src/songs.ts`, `src/song-media.ts`, `src/routes/songs.ts` and `src/db/song-schema.ts`, plus a branch in `src/activity.ts`. With setlists, gigs and sheet music coming, `src/` will be 30+ loose files, and nothing shows which ones belong together or which are internal.
2. **Database queries in routes.** `routes/bands.ts` (my bands, members list) and `routes/admin.ts` (users with their bands) query Drizzle directly, and the routes import from `db/schema`. These are the only use cases without a service function, and the only ones you can't call without HTTP.
3. **Modules reach into each other's internals:**
   - `onboarding.ts` writes directly into `users`, `accounts` (Better Auth's tables), `bands`, `bandMembers` and `invitations`, and uses `hashToken` / `invitationStatus` from `invitations.ts`. It is the de facto owner of five tables.
   - `activity.ts:bandJournal` joins `songs` to get titles. Every new feature (setlists, gigs) will add another join and branch to the activity module, so the dependency points the wrong way.
   - `avatars.ts` owns the "who shares a band with whom" query (`canSee`), which is really a membership rule.
4. **Routes import the composition root.** Every `routes/*.ts` imports `type AppDeps` from `../app`, and `app.ts` imports every route: a type-level cycle. `avatars.ts` and `onboarding.ts` (domain modules) also depend on `app.ts`.

### Clean architecture (dependency direction, separation of concerns)

5. **The error contract is spread across layers.**
   - Most domain modules throw their own classes (`DuplicateSongError`, `SongInUseError`, `TooManyMediaError`, `AlreadyInvitedError`, `AlreadyMemberError`, `InvalidImageError`, `BandNameTakenError`).
   - Each route maps them to a status and code with `try/catch` and `instanceof`, about 8 times.
   - `onboarding.ts` does the opposite: its `OnboardingError` carries the HTTP status (`400 | 401 | 403…`), so HTTP leaks into the domain.

   That's two conventions for the same job. The `already_invited` mapping is also duplicated between `routes/admin.ts` and `routes/bands.ts`.
6. **Persistence details sit in the business logic.** Postgres error codes `23503` / `23505` and constraint names are decoded inside `songs.ts:deleteSong` and `bands.ts:isNameClash`. The same parsing of `(error as {cause?…})` is written twice.
7. **Service signatures are inconsistent.** They take `db`, `deps`, `{db, storage}`, `Pick<AppDeps,…>` or `InvitationDeps`. `now` is injectable in invitations and onboarding only. Each module picks its own convention.
8. **Session typing forces `c.var.user?.id ?? ""` 15 times.** `requireUser` doesn't narrow `user` to non-null, so every route falls back to `""` by hand. That's noise, and a silent bug risk if a guard is ever forgotten: the request would run as user `""`.

### Duplication (small but telling)

9. **Request schemas are copied.**
   - The instrument union is written 3 times (`routes/bands.ts`, `routes/songs.ts`, `routes/invitations.ts`).
   - `inviteBody` is in both `routes/admin.ts` and `routes/bands.ts`.
   - `text()` / `optionalText()` helpers appear in 3 files.

   Also, the root CLAUDE.md says `packages/shared` holds Zod schemas, but it contains none.
10. **Guards are repeated on every band route.** `member` is added to every route in `routes/bands.ts` and `routes/songs.ts` instead of once per sub-app.

## Proposal: feature modules with internal layers

Go with **vertical feature modules**, each with a strict internal dependency rule. **Not** fully hexagonal (repository interfaces in front of Drizzle): at this size it doubles the code without a real payoff. Drizzle *is* the data-access layer, the tests use a real Postgres, and nobody will swap the database.

```
apps/api/src/
  main.ts                    # was index.ts: env → adapters → createApp
  app.ts                     # composition: middleware, error handler, mounts modules
  deps.ts                    # AppDeps (breaks the routes ↔ app cycle)
  core/                      # cross-cutting, no knowledge of features
    errors.ts                # AppError(code, message, details?) + apiError + status table
    db/client.ts, db/pg-errors.ts  # isForeignKeyViolation / isUniqueViolation(constraint)
    http/validation.ts, http/schemas.ts   # validationHook, text(), optionalText(), uuid params
    http/session.ts, http/band.ts, http/rate-limit.ts, http/security.ts
    activity/record.ts       # recordActivity only
  adapters/                  # outside world: implementations of ports
    mail/ (mailer, layout, templates), storage.ts, auth.ts
  modules/
    bands/        routes.ts  service.ts  schema.ts (Drizzle)  dto.ts (Zod in/out)
    members/      … (members list, instruments, canSee for avatars)
    songs/        routes.ts  service.ts  media.service.ts  schema.ts  dto.ts
    invitations/  routes.admin.ts  routes.band.ts  service.ts  token.ts  schema.ts
    onboarding/   routes.ts  service.ts
    profile/      routes.ts (me + avatars)  service.ts  avatars.ts
    journal/      routes.ts  service.ts
    admin/        routes.ts  service.ts
  db/schema.ts               # re-exports modules/*/schema.ts (drizzle-kit keeps one entry)
```

### Rules

The point is to make these checkable, for example with a small Biome `noRestrictedImports` setup or a test that greps the imports:

1. **`routes.ts` → `service.ts` → Drizzle.** Routes never import `drizzle-orm` or `db/schema`, and services never import `hono`.
2. **A module only imports another module through that module's `service.ts`, never its tables.**
   - Onboarding calls `bands.createBand(tx, …)`, `members.addMember(tx, …)` and `invitations.consume(tx, …)` instead of writing their tables.
   - Services that take part in another module's transaction accept a `tx`.
3. **Services throw `AppError(code)` with a code from `ERROR_CODES`, never an HTTP status.** One code → status table in `core/errors.ts`, and the global `onError` turns it into the JSON error. That removes every `try/catch` + `instanceof` from routes and `OnboardingError`'s statuses. Typed-client narrowing still works, because `ensureOk` relies on the success literal types, and error bodies keep the same shape.
4. **One service context:** `type Ctx = { db; now(); mailer?; storage? }`, built once in `app.ts`. The actor stays explicit (`Member` / `userId`), as it is now.
5. **Session narrowing:** `requireUser` / `requireMember` set an env where `user: SessionUser` is non-null. Each routes file then reads `c.var.user.id`, and the 15 `?? ""` go away.
6. **The journal is extensible instead of central.** Each module exports a small "journal enricher", e.g. songs exports `{ targetType: "song", titles(ids) }`. The journal module runs a query per target type present, so setlists and gigs plug in without touching `journal/`.

### Shared schemas

Move the request schemas (song fields, instrument union, invite body, profile) to `packages/shared` as Zod, since CLAUDE.md already promises that. The web forms would then validate with the exact same rules. This is optional and the most visible change for the web app, so it comes last.

## Migration plan

Small, safe PRs; `bun run check` and e2e green at each step.

| # | Step | Risk |
|---|---|---|
| 1 | `deps.ts`, `core/errors.ts` with `AppError` + code→status table, `pg-errors.ts`; convert every domain error and `OnboardingError`; delete the route `try/catch`es | Low: error responses must stay identical (the existing route tests cover them) |
| 2 | Non-null session/band env typing; `.use(member)` once per band sub-app | Low: check the typed client still sees every route |
| 3 | Move queries out of `routes/bands.ts` and `routes/admin.ts` into services | Low |
| 4 | Create `modules/` and move files feature by feature (songs first, as a template), including the Drizzle schemas; update `apps/api/CLAUDE.md` | Mechanical, no behaviour change; migrations unaffected (`db:generate` must report no diff) |
| 5 | Untangle onboarding (call bands, members and invitations services with a `tx`) | Medium: the most delicate transaction; existing tests cover it |
| 6 | Journal enrichers (before setlists arrive) | Low |
| 7 | Import-boundary check in `bun run check` | Low |
| 8 | (Optional) Zod request schemas in `packages/shared`, used by the web forms | Medium: touches the web app |

Steps 1–3 already fix most of the day-to-day friction without moving any files. Step 4 is the big diff but only moves code, so it's easier to review as its own PR.
