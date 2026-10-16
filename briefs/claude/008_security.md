# 008 - Security guards: review and proposal

> 🕒 Study posted on Friday 2026/10/16 19:23

Review of [008_security](../vince/008_security.md).

## Review

1. **No Helmet needed.** Hono's built-in middleware covers what Helmet did: `secureHeaders` (security headers and CSP), `csrf` (requests from other sites), `bodyLimit` (request size). No extra dependency.
2. **No CORS, on purpose.** The API serves the web app on the same origin, and Vite proxies `/api` in development. CORS only loosens the browser's cross-origin rules: leaving it off is the most secure setting.
3. **Brute force on login and reset is already limited by Better Auth**, with counters in Postgres (fits the stateless server):
   - 3 login or password-change attempts per 10 seconds per IP;
   - 3 reset requests per minute per IP;
   - 100 requests per 10 seconds per IP on its other endpoints.
4. **The real risk is how the client IP is read in production.** Better Auth reads `X-Forwarded-For`. Scaleway adds that header, but its docs don't say whether a proxy along the way adds addresses to it. If the header holds more than one address, Better Auth can't trust it and puts every user in one shared bucket: the whole app would allow 3 login attempts per 10 seconds in total, and anyone could block everyone's logins. The header must be checked on the first deployment, and Better Auth told which proxies to trust (`trustedProxies`) if needed.
5. **Our own API routes aren't rate-limited.** Invitation send and resend could be abused to send many emails: a cost on Scaleway's email service and a risk for the sender domain's reputation.
6. **No account lockout.** Locking an account after N failures lets anyone who knows an email lock that person out. Per-IP limits and 12-character passwords are enough at our size.
7. **Tokens in URLs.** Invitation and reset links carry their token in the URL: `Referrer-Policy: no-referrer` keeps that URL from being sent to other sites.

## Decisions (Vince)

- No breached-password check (Better Auth's Have I Been Pwned plugin) for now.
- No account lockout.
- `Referrer-Policy: no-referrer`.

## Proposal

| Protection | How | Settings |
|---|---|---|
| Security headers | `hono/secure-headers` on every response, web app included | HSTS (production only), `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, a `Permissions-Policy` that turns off camera, microphone and location |
| Content Security Policy | in `secureHeaders` | Only our own site supplies scripts, styles, images, fonts and API calls. The inline theme script in `index.html` is allowed by its hash; a test fails if the script changes without the hash. Inline styles stay allowed (React and the toast library need them). Fonts are already self-hosted. |
| CSRF | `hono/csrf` on `/api` | Refuses form-style requests from other sites (`Origin` and `Sec-Fetch-Site` checks). JSON requests from other sites are already blocked by the browser; Better Auth checks its own endpoints. |
| CORS | none | Documented as intentional |
| Body size | `hono/body-limit` on `/api` | 100 KB. Files will go straight to Object Storage later. |
| Brute force | Better Auth rate limit | Keep the defaults; configure how the IP is read for Scaleway, checked at the first deployment |
| Email abuse | our own limiter in Postgres, reusing the `rate_limits` table | Invitation send and resend: 20 per hour per user. New `too_many_requests` error code, translated. 429s logged at `warn` (#42). |
| Dependencies | GitHub Dependabot security updates, `bun audit` in CI | Free |

## Plan

1. #48 Security headers and CSP, with the hash test, checked with `bun run serve`.
2. #49 Request guards: CSRF and body limit on `/api`, the "no CORS" rule in `apps/api/CLAUDE.md`.
3. #50 Rate limiting: invitation limiter, `too_many_requests` code, IP settings for Scaleway with a deployment check.
4. #51 Dependabot security updates and `bun audit` in CI.

## Sources

- [Scaleway Serverless Containers request headers](https://www.scaleway.com/en/docs/serverless-containers/reference-content/request-headers/)
- Better Auth 1.7 source: default rate limit rules (`api/rate-limiter`) and client IP resolution (`@better-auth/core/utils/ip`).
