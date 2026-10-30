# Admin backoffice

> 🕒 Brief posted on Thursday 2026/10/29 17:56
>
> 🕒 Brief settled on Thursday 2026/10/29 18:07

An administration console, as a new application. Decisions: [study 023](../claude/023_admin-backoffice-review.md).

## Specifications

- URL: admin-beta.coverband.fr. The same container and API serve it, chosen by the request's host; locally and in the end-to-end tests, `admin.localhost`.
- Access: only an admin can log in (a non-admin is signed out, with an explanation). Its own login: sessions aren't shared with the main app.
- Not indexed by search engines: robots.txt and an `X-Robots-Tag: noindex` header.
- Frontend: desktop browser first, using the same backend as the main app.
- Technology: Shadcn Admin Kit (react-admin's core with shadcn/ui and Tailwind), with our own data provider for `/api/admin`.
- English only: a deliberate exception to the i18n rule.

## Features

### Homepage

A few numbers to monitor: bands, users, songs, documents, documents storage (from the database), active users (a session in the last 30 days), pending invitations, new bands this month.

### Bands

#### List

- Band name
- Creation date
- Band leaders (there can be several)
- Members

#### Details

- Lineup
- Stats: songs, documents
- Storage used out of its quota ("120 MB of 500 MB"). The quota may change later; not editable for now.
- Activity: the band's journal

Actions:

- **Disable / enable the band.** A disabled band shows its members a "This band is suspended" page.
- **Delete the band**, only once it is disabled, confirmed by typing its name. Its files (documents, logo) are deleted from storage too. Members keep their accounts. The name becomes free again.

### Users

#### List

All users, whatever their band, with:

- Email
- First name
- Last name
- Bands (with a star icon when leader)
- All their instruments, without duplicates

With pagination, a search by email or name, and filters (admins, users with no band).

#### Details

Profile, bands with their role, last session, pending invitations.

Actions:

- **View the app as this user:** opens the main app in a new tab, which starts the read-only impersonation there after a confirmation (the admin needs to be logged in to the main app too).
- **Block / unblock** the user (their sessions end).
- **Send a password reset email.**
- **Delete** the user, except the only band leader of a band.

### Band leader invitations

Managing band leader invitations, the same as in the main app.

### Notifications

> [!NOTE]
> This page will be implemented in a future brief.

## Impact

What the admin app offers is removed from the main app: the admin page, its menu entry, the users list. The main app keeps the impersonation banner and gains the entry point that starts an impersonation. The main app's admin page goes only once the admin app is in production.

## Issues

- [#251 Admin backoffice Epic](https://github.com/TitoVince35/coverband/issues/251)
- [#246 Admin app: the new app, its host and its login](https://github.com/TitoVince35/coverband/issues/246)
- [#247 Admin app: bands, list and details](https://github.com/TitoVince35/coverband/issues/247)
- [#248 Admin app: disable, enable and delete a band](https://github.com/TitoVince35/coverband/issues/248)
- [#249 Admin app: users, list, details and actions](https://github.com/TitoVince35/coverband/issues/249)
- [#250 Admin app: band leader invitations, and the main app's admin page removed](https://github.com/TitoVince35/coverband/issues/250)
