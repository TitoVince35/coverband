# Admin app (`apps/admin`)

The administration console (#246, brief 024, study 023): React + Vite + [Shadcn Admin Kit](https://marmelab.com/shadcn-admin-kit/) (react-admin's `ra-core` with shadcn/ui on Base UI, Tailwind). Cross-cutting rules are in the root `CLAUDE.md`. **Desktop first.** **English only** (the deliberate exception to the i18n rule): no locale files.

## Hosting and login

- The API serves the built app on its own host: `admin-beta.coverband.fr` in production (`ADMIN_URL`, `infra/container.tf`), `admin.localhost` locally (browsers send `*.localhost` to the machine): `https://admin.localhost:5174` with `bun run dev` (its own Vite dev server, proxying `/api`, which keeps the browser's host; the web app's dev server, which would answer for `admin.localhost:5173` too, redirects there), `https://admin.localhost:3000` with `bun run serve`, `http://admin.localhost:3100` in the end-to-end tests. The API picks the app from the request's host (`src/core/http/admin-host.ts` in the API).
- On that host, the API only answers `/api/health`, `/api/auth/*` and `/api/admin/*` (404 otherwise), without the beta access code. Its session cookie stays on that host: logging in to the admin app doesn't log in to the web app, nor the other way round.
- `authProvider` (`src/lib/auth-provider.ts`): Better Auth's email and password login; someone without the admin role is signed out at once and told "This console is for administrators only." (`ADMINS_ONLY`). `requireAdmin` on every `/api/admin` route is the real guard.
- No service worker, no inline script (the API's security policy applies), `robots.txt` disallowing everything plus the API's `X-Robots-Tag`. The kit's telemetry is off (`disableTelemetry`).

## Data

- `dataProvider` (`src/lib/data-provider.ts`) calls our own `/api/admin/<resource>` routes rather than a generic REST format: `getList` sends `page`, `perPage`, `sort`, `order` and the filters (`listQuery`, tested) and expects `{ data, total }`; `getOne` expects `{ data }`. Other methods are added with the features needing them. `stats()` gives the homepage numbers (`GET /api/admin/stats`).
- `apiFetch` (`src/lib/api.ts`) throws react-admin's `HttpError` with the API's message (ours, `{ error: { message } }`, or Better Auth's, `{ message }`).
- The homepage (`src/components/dashboard.tsx`): bands, new bands this month, users, active users (a session in the last 30 days, impersonations left out), songs (archived included), documents, pending invitations (titles in the heading font, larger), then documents storage: a ring of the bytes used out of every band's quota added up (`StorageRing`, `src/components/storage-ring.tsx`: the used part in the primary colour on a muted track, the percentage inside, one decimal under 10 %, then the sizes in words; `formatBytes`, powers of 1000).

## Bands (#247)

- `src/components/bands.tsx`: `BandList` (the `bands` resource: searched by name, `q`; sorted by name, creation date or member count; band leaders, several possible; a row opens the band) and `BandShow` (genre and creation date, lineup with roles and instruments, songs and documents, documents storage out of the band's quota with `StorageRing`, the latest `ADMIN_JOURNAL_SIZE` events). react-admin first shows the list's row while a band's page loads: `BandPage` waits for its details (`lineup`).
- Journal sentences in English: `journalSentence` (`src/lib/journal.ts`, tested), the web app's `journal.*` sentences; an action without one says its code. A new band event needs a sentence in both apps.
- No avatars on the admin host (their route isn't there): the lineup shows names.
- **Disable, enable, delete** (#248, `BandActions`, `src/components/band-actions.tsx`): disabling and enabling are confirmed (`Confirm`), through `dataProvider.setBandStatus`; deleting is only offered once disabled, in a dialog where the band's name is typed (`dataProvider.delete` with `meta: { name }`), then back to the list. The list has a Status column ("Suspended").

## Users (#249)

- `src/components/users.tsx`: `UserList` (the `users` resource: email, first and last names, bands with a star for those they lead, instruments across bands without duplicates, Admin and Blocked badges; searched by email or name, `q`; "Admins" and "No band" toggles, `admins` and `bandless`; sorted by email; the kit's toggles take `w-auto`, being made for a sidebar) and `UserShow` (profile, last session, bands, pending invitations, and `UserActions`).
- **Actions:** "View the app as this user" opens the web app's `/impersonate/<id>` (the API's `impersonateUrl`: null for an admin, oneself included), which starts the read-only impersonation of #214 once confirmed; the admin needs to be logged in to the web app too (sessions are per host). "Send a password reset email" (`dataProvider.sendPasswordReset`). Block / Unblock and Delete, confirmed (`dataProvider.setUserBanned`, `dataProvider.delete`); never offered for an admin. Deleting the only band leader of a band is refused (`only_band_leader`, its message says so).

## Band leader invitations (#250)

- `src/components/invitations.tsx`: `InvitationList` (the `invitations` resource, `/api/admin/invitations`, which answers in react-admin's shape: open invitations, pending or expired, newest first, no pagination): "Invite a band leader" (email and the email's language, `dataProvider.create`), and on each row "Send again" (`dataProvider.resendInvitation`) and "Revoke" (confirmed, `dataProvider.delete`).

## The kit's code

- `src/components/admin/`, `src/components/ui/` and `src/lib/field.type.ts` come from the kit's registry (`bunx --bun shadcn@latest add https://marmelab.com/shadcn-admin-kit/r/admin.json`, from `apps/admin`; shadcn components with `bunx --bun shadcn@latest add <name>`). They are ours to edit, as shadcn intends: CoverBand's name and logo in `login-page.tsx` and `app-sidebar.tsx`, dark theme by default (`theme-provider.tsx`), autocomplete on the login fields, sortable headers no wider than their padding (`data-table.tsx`: the last column overflowed). Biome formats them but doesn't lint them (`biome.json` overrides), and `tsconfig.json` turns off `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` for them.
- Our own code (`src/app.tsx`, `src/lib/`, `src/components/*.tsx`) follows the usual rules. The theme tokens in `src/index.css` are the web app's: keep them in sync.
- Routes are react-admin's (a hash router: `/#/...`). Resources: bands (#247), users (#249), band leader invitations (#250). A list route answers `{ data, total }` and takes `page`, `perPage`, `sort`, `order`, `q`, validated by `listQuery` in the API's `modules/admin/routes.ts`.
