# 023 - Admin backoffice brief: challenge and decisions

> 🕒 Study posted on Thursday 2026/10/29 18:07

Review of [024_admin_backoffice](../vince/024_admin_backoffice.md): the questions raised, and what Vince decided.

## A separate app

- **Worth its cost.** A new workspace, a build, a second host, its own login and end-to-end setup. A lazy-loaded section of the main app would keep react-admin out of the phone bundle too, but the console will grow (notifications, band management, stats), and it is desktop first.
- **One container, two hosts.** The API serves the main app on `beta.coverband.fr` and the admin app on `admin-beta.coverband.fr`, chosen by the request's host: one more DNS record and custom domain in `infra/`, no second container or deploy. Locally and in the end-to-end tests, `admin.localhost` (browsers resolve `*.localhost` to the machine).
- **Separate logins.** Session cookies stay on the host that set them; sharing them across `.coverband.fr` would send an admin session to the phone app too. `requireAdmin` on `/api/admin/*` is the real guard; the admin app signs out a non-admin, with an explanation.
- **Indexing:** robots.txt only stops crawling, so the admin host also sends `X-Robots-Tag: noindex`.

## Technology

- **Shadcn Admin Kit** (by Marmelab, react-admin's authors): react-admin's core (`ra-core`) with shadcn/ui and Tailwind, our stack and look. Classic react-admin is Material UI, and its default data provider expects REST conventions (`Content-Range`, `_sort`, `_start`).
- **Our own data provider** for the `/api/admin` routes, rather than bending the API to react-admin.
- **English only:** a deliberate exception to "i18n from day one", since only the admin uses it.

## Log in as someone else

Better Auth's impersonation sets the session on the host that calls it, so from the admin app it would impersonate in the admin app. Instead, the user's page in the admin app opens `beta.coverband.fr/impersonate/<userId>` in a new tab, and the main app starts the read-only impersonation there, after a confirmation. The admin needs to be logged in to the main app too. The banner, the read-only guard and the activity entry from #214 stay as built.

## Homepage

- **Documents storage, from the database.** Only documents record their size; logos, avatars and thumbnails don't. Listing the bucket would be slow and run on every visit.
- **More numbers:** active users (a session in the last 30 days), pending invitations, new bands this month.

## Bands

- **Leaders:** a band can have several (the role is per membership), so the list shows them all.
- **Quota:** 500 MB of documents per band (`DOCUMENT_LIMITS.perBand`), shown as "120 MB of 500 MB". It may change later; not editable for now.
- **Activity:** the band's existing journal.
- **Disable:** a `disabled_at` column (added in one step, safe for migrations). Members see a "This band is suspended" page, rather than a 404 that would leave them wondering. An admin can enable it again.
- **Delete:** only once disabled, confirmed by typing the band's name. The database cascade doesn't reach Object Storage, so documents, logo and thumbnails are deleted there too. Members keep their accounts. The name becomes free again (the band and its URL are gone).

## Users

- **List:** pagination, a search by email or name, and filters (admins, users with no band). Instruments are per membership: the list merges them across the user's bands.
- **Details:** profile, bands with their role, last session, pending invitations.
- **Actions:** view the app as this user; block or unblock (Better Auth's admin plugin bans and ends the sessions); send a password reset email; delete, except the only band leader of a band (for now).

## Band leader invitations

The API is shared; the admin app gets its own screen, the phone app's components can't be reused as they are.

## Impact on the main app

The admin page, its menu entry and the users list (with its impersonate button) go; the impersonation banner stays, and the `/impersonate/<userId>` entry point is added. The admin end-to-end tests move to the admin host. The main app's admin page stays until the admin app is in production.
