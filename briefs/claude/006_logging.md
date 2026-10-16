# 006 - Logging and activity: review and proposal

> 🕒 Study posted on Friday 2026/10/16 18:14

Review of [007_logs](../vince/007_logs.md).

## Review

1. **Two needs in one brief.** Technical logs (errors, warnings) help with debugging and monitoring. Functional events (invitation sent, user registered, a band changed) are product data: stats and the future activity feed need them complete and queryable. They get two different stores.
2. **"CRUD" means writes only.** Logging reads is noise.
3. **Access logs: not all of them, not none of them.** The request line is often the only context for a 500. Keep one line per failed or slow request, and the full access log in development only.
4. **Personal data.** Logs and activity rows hold IDs, never emails, names, tokens or passwords. Invitation tokens are in URLs (`/api/invitations/:token`): log the route pattern, never the raw path.
5. **Not covered yet:** structured format, request correlation, log level, failed logins (they belong to the security brief).

## Decisions (Vince)

- Functional events go to an **activity table** in Postgres.
- **No errors from the web app** for now. Suggest it later if needed.
- **No alerts** for now.
- **Retention:** 30 days for logs, one year for activity rows. Logs are for debugging, and the activity table keeps the long-term history.

## Proposal

### Technical logs: JSON on stdout, read in Cockpit

The container writes logs to stdout/stderr. Scaleway Serverless Containers sends them to **Cockpit** (Scaleway's Grafana-based observability console) with nothing to install or configure in the app. No log files: the server is stateless.

- **A small logger of our own** (`apps/api/src/log.ts`, no dependency): levels `debug` / `info` / `warn` / `error`, one JSON object per line (`time`, `level`, `msg` plus fields). Cockpit can then filter by level, `requestId`, `userId` or `bandId`. In development, a readable one-line format instead of JSON.
- **New environment variables:** `LOG_LEVEL` (default `info`) and `LOG_FORMAT` (`json` by default, `pretty` in `.env.example`).
- **Request context:** Hono's `requestId()` middleware. The request's logger carries `requestId`, `userId`, and `bandId` on band routes. The request ID is also returned in the `X-Request-Id` header, so a bug report can point to the right lines.
- **What is logged:**
  - `error`: unhandled errors in `onError`, with the stack, method, route pattern, status and request context. Also failures to send email.
  - `warn`: 5xx responses and slow requests (over 1 s).
  - `info`: startup, applied migrations, default admin bootstrap. These are today's `console.log` calls.
  - `debug`: one line per request (method, route pattern, status, duration). Off in production, on in development. It replaces `hono/logger`.
  - 4xx responses are not logged: a 404 for a non-member or a 400 from a form is normal behaviour.
- **Better Auth** gets our logger through its `logger` option, so its warnings and errors land in the same format.

### Functional events: an `activity` table

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | |
| `band_id` | uuid, nullable | null for events outside a band (leader invitation sent by an admin) |
| `actor_id` | text, nullable | the user who acted; `on delete set null` |
| `action` | text | stable code, e.g. `invitation.sent` |
| `target_type`, `target_id` | text | what was acted on (`invitation`, `band`, `user`, later `tune`, `setlist`...) |
| `data` | jsonb | small, non-personal details (role, new genre, tune title) |
| `created_at` | timestamptz | indexed with `band_id` for the feed |

- **Action codes** live in `ACTIVITY_ACTIONS` in `@coverband/shared`, like `ERROR_CODES`, so the future feed can translate them.
- **Written in the same transaction as the change** through a `recordActivity(tx, ...)` helper, so there is no event without the change and no change without its event. For an invitation, the event is recorded once the email has been sent, because a failed send deletes the invitation.
- **Events recorded today:**
  - `invitation.sent`, `invitation.resent`, `invitation.revoked`
  - `user.registered` (an invitation accepted with a new account)
  - `band.created` and `member.joined`
  - `band.genre_changed`

  Every new feature (tunes, setlists, gigs) adds its own events.
- **Stats** come from SQL on this table and on the business tables, not from logs.
- **Who can read it** is the activity feed brief's job. For now, the table is only written.

### Retention

- **Logs, 30 days:** in Cockpit, set the retention of the Serverless Containers logs data source to 30 days. Scaleway allows changing the retention of its own data sources, not only custom ones.
- **Activity, one year:** a daily purge of rows older than one year. The server can't run an in-process cron, so the purge would run from a Serverless Containers cron trigger calling a protected internal route. No row will be a year old before October 2027, so this is a Backlog task, not urgent.

## Cost check (Scaleway pricing, checked today)

- **Ingestion:** logs from Scaleway products, including Serverless Containers stdout, are **included, not billed**. Only custom data pushed to Cockpit is billed (€0.35/GB). We push nothing custom.
- **Retention:** free up to the default (7 days for logs). Beyond that, **€0.002 per GB per day** of data stored.
- **Estimate for 30 days:** at a generous 100 MB of logs per month, about 80 MB are stored past the free 7 days. That is about €0.002 × 0.08 × 365 ≈ **€0.06 per year**. Even ten times more stays under €1 per year.
- **Activity table:** a few hundred bytes per row, nothing noticeable in the Serverless SQL Database.
- **Alerts** would cost €0.015 per rule per day. They're not used.
- The older "€29/month extended retention" option on Scaleway's managed services pricing page predates per-volume billing. The documentation's per-GB pricing applies.

Sources: [Cockpit pricing](https://www.scaleway.com/en/docs/cockpit/reference-content/cockpit-pricing/), [Managed services pricing](https://www.scaleway.com/en/pricing/managed-services/), [Change data sources retention period](https://www.scaleway.com/en/docs/cockpit/how-to/change-data-retention/), [Monitor a container](https://www.scaleway.com/en/docs/serverless-containers/how-to/monitor-container).

## Plan

1. #42 **Structured logging:** `log.ts`, `LOG_LEVEL` / `LOG_FORMAT`, request ID and context, error / slow / debug request logs, Better Auth logger, replacement of `hono/logger` and `console.*` in the API.
2. #43 **Activity table:** schema and migration, `ACTIVITY_ACTIONS`, `recordActivity`, events for invitations, onboarding and band changes, tests.
3. #44 **Cockpit log retention at 30 days:** a step in the production setup.
4. #45 **Activity purge** (Backlog, before October 2027).
