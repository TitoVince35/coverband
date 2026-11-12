# 025 - Why the database is awake so long

> 🕒 Study posted on Thursday 2026/11/12 22:47

Answer to Vince's question after the cost study ([033_cost-diagram](../vince/033_cost-diagram.md)): the Serverless SQL Database is about two thirds of the bill (≈ €13.80 of ≈ €21.45 a month, November projected), awake about 99 vCPU-hours a month for a few beta bands. Why, and what to change.

## How it was measured

- **The bills**, from Scaleway's billing API (read-only): October and November 2026 by product.
- **The code**: every place that queries the database without a member asking for data.
- **The logs**, from Cockpit (Loki), over the 7 days to 2026/11/12, read with a temporary read-only token, deleted afterwards:
  - each container start (the server's "API listening" line);
  - each database wake-up (PostgreSQL's "starting PostgreSQL" line);
  - the server's warnings and errors.

## What the logs showed

| | 7 days | Per day |
| --- | --- | --- |
| Container starts | 180 | ≈ 26, spread evenly over the 24 hours |
| Database wake-ups | 145 | ≈ 21 |
| Database wake-ups within 90 s of a container start | **121 (83%)** | |
| Requests failing with a 500 (`CONNECTION_CLOSED`) | **285** | in bursts, up to 18 in a minute |

- **The container starts aren't band members.** They come at every hour, 3 a.m. as often as 8 p.m., with irregular gaps (20 minutes to 3 hours, median 44). So they're outside requests: bots scanning the public domain, link previews, the redirected bare domain, the nightly cron. The logs don't keep requests, so who exactly isn't known, and doesn't need to be once a start no longer touches the database.
- **Nearly every container start woke the database.** Before answering anything, the server checked that the default admin exists (`ensureAdmin`, at startup in `src/main.ts`). Each wake-up is billed at least 5 minutes, at every hour of the day.

## The causes, in the code

1. **The default admin's check at startup**: 83% of the wake-ups (above).
2. **Better Auth's rate limiter on `get-session`.** Its counters are stored in Postgres (`storage: "database"`), and it counts every `/api/auth/*` request, so it read and wrote `rate_limits` on every app start, logged in or not. Confirmed in Better Auth 1.7.10's source: `onRequestRateLimit` runs for any path, and the database storage reads, then creates or updates, a row per IP and path.
3. **Returning to the app** refreshes data older than 5 minutes, and the notes from the team after 1 minute. That's real use: during a rehearsal, each return after a pause wakes the database again.
4. **The nightly cron**: one wake-up a night, about €0.35 a month.

Not causes: `/api/health` doesn't query the database, and the web app has no timer polling the server.

## A bug found on the way

The server kept its database connections open indefinitely (postgres.js without `idle_timeout`). When the Serverless SQL Database goes to sleep, it closes every connection; the container, still running, then sent its next queries over dead connections, and they failed with `CONNECTION_CLOSED`. That made 285 server errors in a week, which a band member saw as errors when opening the app after a quiet spell.

## Changes made

- **A. The default admin's check runs before the first login attempt** of each container, never at startup. It's done at most once per container (`defaultAdminOnce`, `src/bootstrap.ts`, run by a middleware on `POST /api/auth/sign-in/*`). A login uses the database anyway. A failure is logged and tried again at the next login, never blocking it. Moving it to the deploy workflow was the other option, but it would have needed the admin's password as a new GitHub secret.
- **B. `get-session` is no longer rate-limited** (`customRules: { "/get-session": false }`): it's only a read. Logging in and password resets keep their limits. A test checks that reading the session writes no row while a login still does; it fails without the change.
- **The bug: unused connections close after 20 seconds** (`IDLE_TIMEOUT_SECONDS`), well before the database's own idle cut, so a sleeping database leaves no dead connection behind.
- **Rule written into `apps/api/CLAUDE.md`:** nothing may query the database at startup or on a timer, since every query wakes it for at least 5 billed minutes.

## What to expect

- Up to 83% fewer database wake-ups: those caused by container starts go, real use stays. On ≈ €13.80 a month for the database, that's a few euros a month, likely back under the €20 budget alert.
- Faster cold starts: the first request no longer waits for the database to wake up.
- No more `CONNECTION_CLOSED` errors.

To check after release:
- the database's line on the next bills;
- in Cockpit (Scaleway Logs), `starting PostgreSQL` lines should now follow member activity, not container starts;
- `Better Auth: INTERNAL_SERVER_ERROR` should disappear.

## Kept for later, if the bills stay high

- **C. Cache the session in its signed cookie** for a few minutes (Better Auth's `cookieCache`): fewer session lookups during an active session. The trade-off: a revoked session stays valid for up to those few minutes.
- **D. The smallest always-on database** (DB-DEV-S, about €11.90 a month, fixed). At today's 99 hours a month it would already be cheaper than the serverless one, and it has no wake-up delay, but it costs the same with zero users. Worth comparing again once A and B show in the bills.
