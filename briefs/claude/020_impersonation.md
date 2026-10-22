# 020 - Impersonation: an admin sees the app as another user

> 🕒 Study posted on Thursday 2026/10/22 14:52

Question from Vince: does the authentication library offer an "impersonate" feature?

## What Better Auth gives

Yes: the **admin plugin** (already enabled, `apps/api/src/adapters/auth.ts`, `admin({ adminRoles: [ADMIN_ROLE] })`) has it, and the database is ready (`session.impersonated_by` since `0000_auth.sql`). Better Auth 1.7.10:

- `POST /api/auth/admin/impersonate-user` `{ userId }` (web: `authClient.admin.impersonateUser`). It creates a **real session of the target user**, with `impersonatedBy` = the admin's id, valid 1 hour (`impersonationSessionDuration`, in seconds). The admin's own session token goes into a signed `admin_session` cookie, and the session cookie switches to the new session.
- `POST /api/auth/admin/stop-impersonating`: deletes the impersonation session, puts the admin's session back from that cookie.
- Allowed to roles with `user: ["impersonate"]`: our `admin` role. Impersonating another admin is refused (unless `allowImpersonatingAdmins` or the `impersonate-admins` permission).

## What it means for CoverBand

- **Tenancy holds as it is.** The session is the user's: the band guards (`requireMember`, `requireLeader`) see exactly that user's bands and roles, no more. Nothing to change in the modules.
- **Anything done meanwhile is the user's.** Every write would be recorded in `activity` with the user as its actor, and Better Auth's own endpoints would act for them: `revoke-other-sessions` would log the real user out of every device. That is the main risk.
- **When the hour runs out**, the session cookie points to an expired session: the admin is logged out and logs in again (their own session is still valid, but only `stop-impersonating` brings it back).
- **A logout while impersonating** would delete the user's session and leave the admin's session alive in the cookie, unused until it expires.
- **The web app's cache** holds the admin's data (bands, the offline copy): switching to another account must forget it, like a login does (`removeUserQueries`), both ways.

## Proposal

1. **Read-only.** While a session has `impersonatedBy`, every request other than `GET` / `HEAD` / `OPTIONS` under `/api` is refused with 403 `impersonation_read_only`, Better Auth's endpoints included, except `stop-impersonating` and `sign-out`. A guard in the app before Better Auth's handler, looking the session up only for those methods (one more query on writes, none on reads). The purpose is support ("what does this musician see?"), not acting for someone; writes can come later if needed, with their own audit.
2. **Audited.** Starting records `user.impersonated` (actor: the admin, target: the user, no band), from a Better Auth database hook on session creation (not in the session's transaction: Better Auth owns it). The request logs carry `impersonatedBy` next to `userId`.
3. **Admin console.** A "View as" button on each user of the admin list (not admins, not oneself; disabled offline). Once started: the user's data replaces the admin's (`removeUserQueries`), and the app opens on the home page.
4. **Banner.** Under the header, on every page, while impersonating: "Viewing as {name}: read-only", with a **Stop** button (back to the admin console). Logging out while impersonating stops impersonating first, then logs out the admin.
5. Better Auth's defaults stay: admins only, never another admin, 1 hour.

Out of scope: writes as the user, a reason typed before starting, showing impersonations in the admin console.
