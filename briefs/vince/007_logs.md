# Logging solution

> 🕒 Brief posted on Friday 2026/10/16 18:04
>
> 🕒 Brief settled on Friday 2026/10/16 18:26

I want the application to generate useful logs and store them.

## Logs

Here is what I need to log:
- technical: errors, warnings
- functional: sending invitations, registering users, user actions (CRUD)

I don't need the access logs that currently show on the console.

## Future usage

- debugging
- live monitoring with observability tools
- stats

## Storage

- I need log storage to be as cheap as possible
- Ideally, logs can be viewed in the hosting console

## Issues

- [#42 Structured logging: JSON logs on stdout for Scaleway Cockpit](https://github.com/TitoVince35/coverband/issues/42)
- [#43 Activity table: record functional events](https://github.com/TitoVince35/coverband/issues/43)
- [#44 Cockpit: keep container logs for 30 days](https://github.com/TitoVince35/coverband/issues/44)
- [#45 Purge activity rows older than one year](https://github.com/TitoVince35/coverband/issues/45)
