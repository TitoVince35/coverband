# 016 - Production addons: version and beta access

> 🕒 Study posted on Tuesday 2026/10/20 07:21

Answer to `briefs/vince/016_production_addons.md`: which version, where to show it, and how to keep the beta private.

## Decisions (Vince)

- **Version:** `0.1.0`, shown on the login page (not in a footer).
- **Beta privacy:** a shared access code, not IP filtering.
- `noindex` and `robots.txt` are added too (recommended below, not objected to).

## Versioning

**Current version: `0.1.0`.** Every `package.json` says `0.0.0` today. Semantic versioning keeps `0.x` for software that isn't stable yet, which fits a beta. `1.0.0` would then mean "out of beta", when "Coverband Beta" drops "Beta".

**One version for the whole app,** in the root `package.json`. The API and the web app are deployed together in one container, so separate versions would mean nothing. It's bumped in the release PR (`dev` → `main`), and the deploy workflow tags the commit `v0.1.0` on `main`.

**Build hash:** the deploy workflow already has the commit SHA, since that's the image tag. It passes it to the Docker build, and Vite writes it into the web app. Locally, it shows `dev`.

**Not a footer.** CoverBand is an installed app used on stage, mostly on phones. A footer on every page takes a line from setlists and lyrics, and the lyrics view is full screen anyway. The version goes where you'd look for it: the login page (Vince's choice; the account page was the other option), and the access code screen that replaces it for visitors without access.

**Also in `/api/health`.** The deploy workflow's last step then checks that the *new* build answers, not just "a" build. Today, a rollout that silently kept the old image would pass. Later, the installed app could compare its own version with the server's and offer to update (an old service worker keeps serving the previous version).

## IP filtering, studied and dropped

**Before the container: not possible at a reasonable price.**
- **Private container with IAM IP conditions:** every request then needs a Scaleway token in a header, which a browser opening the app can't send. It's for machine-to-machine calls.
- **Web firewall (WAF):** Scaleway's only works in front of a Load Balancer or Object Storage. A Load Balancer alone costs about €10 a month, more than everything else combined, and Scaleway doesn't confirm a container can sit behind it.

**In the container: not iptables, but the app.** The container doesn't see the visitors' connections: everything arrives from Scaleway's proxy, so iptables would only see the proxy's IP, and a serverless container can't change its firewall anyway. It would be a middleware reading `X-Real-IP`.

**Why not IPs at all:**
- **Mobile IPs:** carriers change them often and share them among many customers. Allowed users get locked out, strangers sharing the IP get in.
- **IPv6:** browsers prefer it, and the home connection of the first production login came over IPv6. An IPv4 list would block it.
- **Band members:** each one would need the IPs of their home and their phone, and the phone ones keep changing.
- **Publication:** the repository is public, so a list in a brief or in the code puts personal IPs online.

**What the app already has:** no public sign-up, accounts only from invitations, logins rate-limited per real IP, band pages for members only. What's left is not showing the app to strangers before launch, and keeping search engines out.

## Beta access code (planned design)

- **`BETA_ACCESS_CODE`** (environment variable, a secret in `infra/`; empty: no gate, as in development and the end-to-end tests by default).
- **What's gated: the API.** The web app's files stay public (the repository is public anyway): without access, the app shows a code screen, in English and French, instead of the login page. API requests answer `access_required` (a new error code, translated).
- **Not gated:** `/api/health` (the deploy check runs from GitHub), the code check itself, and the routes of email links: invitations and password reset. A valid invitation or reset link proves the person was invited or owns an account: following it grants access, so invited musicians never need the code.
- **Remembered per device:** a long-lived cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) holding a signature of the code, not the code. Changing the code logs every device out of the gate. Wrong codes are rate-limited per IP, in the `rate_limits` table.
- **Wakes nothing it doesn't need:** the gate runs before any session lookup; only a code attempt touches the database (its rate limit).
- **Removing the gate at launch:** empty `BETA_ACCESS_CODE`, `tofu apply`.

## Search engines

`X-Robots-Tag: noindex` on every response and a `robots.txt` that disallows everything. A few lines, whatever the gate.

## Sources

- [Serverless Containers request headers](https://www.scaleway.com/en/docs/serverless-containers/reference-content/request-headers/)
- [Serverless Containers FAQ](https://scaleway.com/en/docs/serverless-containers/faq)
- [Secure a container](https://www.scaleway.com/en/docs/serverless-containers/how-to/secure-a-container)
- [Edge Services FAQ](https://www.scaleway.com/en/docs/edge-services/faq.md)
- [Edge Services concepts](https://www.scaleway.com/en/docs/edge-services/concepts.md)
