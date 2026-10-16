# 005 - Review of the local mobile access brief, and plan

> 🕒 Study posted on Friday 2026/10/16 13:45

Review of [006_local_mobile](../vince/006_local_mobile.md).

## Review

1. **The dev server only listens on localhost.** Vite needs `server.host: true` to be reachable from the phone. The `/api` proxy then works unchanged. Mailpit is already reachable: Docker publishes port 8025 on every interface.
2. **Login would be refused.** Better Auth only accepts the origin of `BETTER_AUTH_URL` (`http://localhost:5173`). In development, the LAN origin (`http://<ip>:5173`) must be a trusted origin too.
3. **Links in emails would point to localhost.** Invitation and password reset links are built from `BETTER_AUTH_URL`. Tapped in Mailpit on the phone, they would open the phone itself. In development, they use the LAN URL.
4. **The QR code could be cut off.** `bun run dev` (and so the new command) uses `--filter`, which only shows the last lines of each app's output. A QR code is 25 to 30 lines tall: use `--elide-lines=0`, or print it before the apps start.
5. **Picking the right IP.** A machine has several addresses (Docker bridges, VPN): pick the Wi-Fi one, with an environment variable to override it. A firewall (`ufw`) may block ports 5173 and 8025.
6. **No PWA install over plain HTTP.** Service workers and the install prompt need HTTPS or `localhost`. The phone gets a regular web page, which is enough to check screens and layout. Testing the install is out of scope.
7. **One QR code, two tabs: not possible.** A QR code holds one URL, and mobile browsers block a page opening a second tab.

## Decisions (Vince)

- **A separate `bun run dev:lan` command** turns the LAN access on. `bun run dev` stays on localhost only, because anyone on the same Wi-Fi (café, train) could open Mailpit and the invitation links in it.
- **A mail icon in the top toolbar, in development only**, opens Mailpit in a new tab. It replaces the second QR code: one QR code to the web app is enough. The icon builds Mailpit's URL from the current host name (port 8025), so it works on `localhost` and from the phone. It sits in the root layout, so it is also on the login page, where you need it to open an invitation.

## Plan

- #38 `bun run dev:lan`, the dev server reachable from a phone on the local network: Vite on the network, LAN IP detection, trusted origin, email links, one QR code at startup.
- #39 Mailpit shortcut in the toolbar (development only).

Both are in the Backlog, without a sprint. They are independent, and #39 is a small task.
