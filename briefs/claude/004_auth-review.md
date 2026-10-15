# 004 - Review of the authentication brief, and plan

Review of [004_auth_sign_up](../vince/004_auth_sign_up.md). Vince agreed with all points.

## Review

1. **Two levels of roles.** Admin is global, for the whole application. Leader and musician are per band: someone can lead band A and play in band B. The data model stores band roles on the membership, so "leader" is never a global role.
2. **Instrument belongs to the band membership, not the profile.** A musician can play guitar in one band and bass in another. The wizard asks for it, but it is stored per band. A musician who already has an account chooses their instrument for the new band before confirming (added by Vince).
3. **Create the account at the end of the wizard.** In the brief's order, the account is created before credentials are set, so a musician who quits in between would be left with an account and no password. New order: profile → band → password → review, then create everything in one database transaction. An abandoned wizard leaves nothing behind.
4. **Password reset was missing.** It's needed as soon as accounts have passwords (#24).
5. **Sending email needs a provider and a domain.** Invitations depend on it. Locally, Mailpit catches all emails. Production needs a transactional email provider and a domain configured for sending (SPF/DKIM).
6. **Admin from environment variables:** create that account only if no user has that email. The server restarts often, and resetting the password on every start would be a trap.
7. **Cases the brief didn't cover:**
   - Someone who already has an account is invited as a leader: they log in and only create the band.
   - A musician clicks an invitation while logged in with another account: explain, and offer to log out.
   - Musician invitations also expire after 48 hours.
   - Invitations can be resent (new 48 hours) and revoked.
8. **Unique band name:** fine while only admins can create leaders. The URL slug `/b/:slug` is derived from it.
9. **Credentials later:** Better Auth has plugins for TOTP (with "trust this device"), passkeys and third-party providers, so adding any of them requires no rework. Passkeys (fingerprint or face unlock) may suit musicians on phones better than TOTP (#25).

## Plan

**Sprint 2 (from 2 November):**
- #6 Authentication: email/password login, no public sign-up, admin created from environment variables, password policy, route guards.
- #21 Email sending: Mailpit locally, provider in production, EN/FR templates.
- #22 Admin console: users and band leader invitations.
- #8 Deploy to Scaleway, moved up to try the hosting early. It now includes secrets, domain and email sending domain.

**Sprint 3 (from 16 November):**
- #23 Band leader onboarding wizard.
- #7 Band lineup and musician invitations.
- #24 Password reset and change.

**Backlog, in order:** #9 songs, #10 setlists, #11 gigs, #12 personal agenda, #25 study of TOTP, passkeys and third-party login.

## Open questions

- No domain yet: needed before production email (#8, #21).
- ~~Email provider~~: **Scaleway TEM** (decided). 300 free emails per month, same provider as the hosting. Sent over SMTP, so switching to Brevo later only changes environment variables.
