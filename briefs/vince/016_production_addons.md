# Production addons

> 🕒 Brief posted on Tuesday 2026/10/20 07:10
>
> 🕒 Brief settled on Tuesday 2026/10/20 07:21
>
> 🕒 Issues completed on Tuesday 2026/10/20 07:57

## Versioning

Now we need to set an application version. What should the current version be?

I want a footer in the web app with:
- Version tag + build hash

## IP Whitelisting

Since we're in beta and not quite public, it would be nice to filter by IP.

- From Scaleway settings if possible, so the filtering happens before the container wakes up.
- If not, from the container itself (maybe an iptables rule). A WHITELISTED_IPS environment variable could list comma-separated IPs. Empty means no filtering.

## Issues

- [#150 Production addons Epic](https://github.com/TitoVince35/coverband/issues/150)
- [#146 App version and build](https://github.com/TitoVince35/coverband/issues/146)
- [#147 Version on the login page](https://github.com/TitoVince35/coverband/issues/147)
- [#148 Beta access code](https://github.com/TitoVince35/coverband/issues/148)
- [#149 Keep search engines out](https://github.com/TitoVince35/coverband/issues/149)
