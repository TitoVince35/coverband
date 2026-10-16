# Basic security guards

> 🕒 Brief posted on Friday 2026/10/16 19:17
>
> 🕒 Brief settled on Friday 2026/10/16 19:23

Implement standard protections on the API:
- brute-force detection
- CORS
- other standard protections

Propose a library like the old Helmet (Express), or Hono's built-in middleware, with sensible settings.

## Issues

- [#48 Security headers and Content Security Policy](https://github.com/TitoVince35/coverband/issues/48)
- [#49 Request guards: CSRF and body limit on /api, no CORS](https://github.com/TitoVince35/coverband/issues/49)
- [#50 Rate limiting: email-sending routes and client IP behind Scaleway](https://github.com/TitoVince35/coverband/issues/50)
- [#51 Dependency security: Dependabot and bun audit in CI](https://github.com/TitoVince35/coverband/issues/51)
