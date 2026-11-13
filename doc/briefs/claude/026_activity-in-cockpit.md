# 026 - The activity table in Cockpit

> 🕒 Study posted on Friday 2026/11/13 10:28

Vince's question: can the `activity` table go to Cockpit, so the app can be monitored in Grafana? Decision: option 2, in [#320 Activity events in Cockpit's logs](https://github.com/TitoVince35/coverband/issues/320).

## Context

Cockpit's Grafana now has its two Scaleway data sources (they had never been synced; done from Cockpit › Sources de données › « Démarrer la synchronisation »), and two dashboards built on them: "CoverBand – database wakes" and "CoverBand – awake time" (the database awake or asleep and the container running or stopped, minute by minute, and their hours per day, from the `cpu_provisioned` and `instances_total` metrics).

Measured on the night of 2026/11/13, after the fix of study 025: between 01:00 and 07:00 the container started six times, five of them for outside requests, and the database woke once, for the nightly purge. Outside hits no longer query the database.

## The options

### 1. Grafana reads Postgres: not possible, and costly

- Cockpit's Grafana gives its users the Editor role. Adding a data source needs Admin: the data sources page is closed to us, and Scaleway doesn't let users add their own data sources to its managed Grafana.
- Even if it could, every dashboard refresh would query the database and wake it for at least 5 billed minutes, what study 025 removed.

### 2. A log line per event (chosen)

When `recordActivity` records an event, the server also logs it: `{"msg":"Activity","action":"song.added","bandId":…,"actorId":…,"targetType":"song","targetId":…}`.

- **No extra wake-up**: the line comes from a write that already uses the database.
- **In Grafana right away**, through Scaleway Logs (Loki), like the dashboards above: the "Coverband Activity" dashboard. Its query, events per action: `sum by (action) (count_over_time({resource_type="serverless_container"} |= "Activity" | json | line_format "{{.message}}" | json | msg="Activity" [$__interval]))`, with a 5-minute minimum interval.
  - Scaleway wraps each stdout line in its own JSON (`{"stream":"stdout","message":"…"}`), so the app's line is escaped in it: filter on the bare word, unwrap `message`, then parse and match `msg`. A filter on `"msg":"Activity"` with its quotes matches nothing.
  - Short buckets, summed: Loki evaluates a range query at times aligned on the step, so a `[1d]` bucket only counts today's events at midnight. Instant queries are no help: Grafana's Loki query splitting loses their labels.
- **Cost: pennies.** Ingesting logs is free; the lines are tiny (≈ €0.08 a month today for 30 days of container logs).
- **History:** only from the release on, kept as long as Cockpit's log retention (30 days, can be raised). The table stays the full record.
- **After the commit:** logging from inside the transaction would log a change that is then rolled back. postgres.js has no "after commit" hook, so the database client collects what must run after its transaction and runs it once it commits.
- **Nothing personal:** IDs and codes only, as the table and the logs already require.

### 3. A nightly summary (later, if needed)

The 04:17 purge job already wakes the database every night: it could also count yesterday's activity (events by type, active bands and users) and log one summary line. No extra wake-up, one point a day: trends, not the day's activity. It can come in addition to option 2.

### 4. Custom metrics pushed to Cockpit: not now

The server would send counters to a custom Cockpit data source: a network call per event from a stateless container, a token to manage, billed samples. Not worth it at this scale.

## The rule that changes

`apps/api/CLAUDE.md` said "technical logs only: functional events go to the activity table". It stays true for what is kept: the table is the record. The logs get a copy of each event, for monitoring only.

## Still open

A purge ran at 01:03 on 2026/11/13, outside the cron's 04:17. Not the deployment (00:14–00:16, which never calls it) nor any local session. Only holders of the cron secret can call it (the Scaleway trigger, the container's environment, `tofu output cron_secret`). The logs don't say who: the request log keeps neither IP nor User-Agent. To check in the Scaleway console: the trigger's history and the Audit Trail.
