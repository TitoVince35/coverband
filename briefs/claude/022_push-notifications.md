# 022 - Push notifications: installed apps and admin broadcasts

> 🕒 Study posted on Friday 2026/10/23 15:12
>
> 🕒 Study updated on Friday 2026/10/30 16:50

Two questions from Vince: what happens to an already installed app if we add push notifications, and can an admin send a live notification to every subscriber, or to the members of a band?

## Effect on installed apps

Nothing breaks, and nobody needs to reinstall. An installed PWA is the browser running the site in its own window, so it gets new code the same way a browser tab does. Notifications only start once each user opts in.

1. **The service worker updates itself.** `registerType: "autoUpdate"` (`apps/web/vite.config.ts`): the next time someone opens the installed app, the browser checks `sw.js`, finds it changed, and installs the new version. It takes over right away and the page reloads. That new version includes the code that receives and displays push messages.
2. **Nothing reaches anyone until they say yes.** Web Push needs the user to grant notification permission, and the browser only shows that prompt after a tap (iOS requires it). Every existing user starts out unsubscribed. The app needs an "Enable notifications" button somewhere, such as the profile page or a band page, which stores the subscription on the server.
3. **The manifest doesn't change.** Web Push needs nothing new in it.

### What to watch for

- **Service worker type.** The app uses the default `generateSW` mode, where Workbox writes the whole service worker. To handle `push` and `notificationclick` events, either switch to `strategies: "injectManifest"` with our own `src/sw.ts`, or add a small script through `workbox.importScripts`. In either case, **keep the output name `sw.js` and the scope `/`.** If it is renamed, the old worker stays registered next to the new one on existing installs, and it has to be unregistered by hand.
- **iOS.** Push only works for apps added to the Home Screen (iOS 16.4 and later), which installed users already are. In plain Safari it isn't available, so the button only appears when `PushManager` exists.
- **Users who don't open the app.** They keep the old version and stay unsubscribed. We can't push to them to get them back.
- **Lost subscriptions.** A subscription disappears when someone clears site data, uninstalls, or revokes the permission. The server deletes it when the push service answers 404 or 410.
- **VAPID keys.** These are the server's push signing keys, and they are required: Chrome refuses to subscribe without the public key (`applicationServerKey`), and Apple's push service requires VAPID too.
  - **Free, no account.** We generate the P-256 key pair ourselves (`web-push generate-vapid-keys`, or `crypto.subtle.generateKey`): no registration, no API key, no bill. The push services (Google's, Mozilla's, Apple's) check each send against the public key the device subscribed with. Google's needs no Firebase project, Apple's no developer account.
  - **Public and private.** The private key is a secret in `infra/container.tf`, like the SMTP password. The public key isn't secret: the web app reads it from a small route (`GET /api/push/key`) when subscribing, rather than having it baked into the build.
  - **A real `subject`.** VAPID carries a contact (`mailto:` or an `https://` URL). Apple rejects pushes (403 `BadJwtToken`) when it isn't a real address or points at `localhost`, so it is an address on our domain, set in `.env.example` with the keys.
  - **One pair per environment.** A subscription only works with the pair it was made with. Local dev and production each have their own; the end-to-end setup can generate a throwaway pair per run.
  - **Permanent.** Changing production's pair invalidates every subscription. The keys follow the environment-variable process (`env.ts`, `.env.example`, `infra/container.tf`).
- **Fits the stateless server.** Subscriptions go in a Postgres table, and sending happens from API requests, for example "setlist updated → notify the band". Anything time-based, like a reminder the day before a gig, needs a scheduled Serverless Job (see [Where sending runs](#where-sending-runs)): no cron inside the process.
- **Apps installed from the LAN** (`https://<LAN IP>:port`) are a separate origin, so they have separate subscriptions. That only matters for testing.

## Admin broadcasts

Yes to both: each case is a database query that picks which subscriptions to send to.

### What has to be built first

- **A `push_subscription` table**, filled by the opt-in button: `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `locale`, `created_at`. One user can have several rows, one per device.
- **A send function on the API.** It takes a list of subscriptions and a payload, and calls the [`web-push`](https://github.com/web-push-libs/web-push) library once per row. Each message is signed with the VAPID keys and encrypted for that device. The service worker then shows it with `showNotification(title, { body, data: { url } })`.
  - **Checked on Bun 1.4.3** with `web-push` 3.6 against a fake push service. The send succeeds, the `TTL` header is set, the VAPID signature verifies against the public key, and the payload decrypts (`aes128gcm`, with the device's key) to exactly what was sent. A 410 answer throws a `WebPushError` with `statusCode` 410, which is what the cleanup reads. No need to rebuild it on Bun's `crypto`.
  - **For the end-to-end fake push service:** `web-push` only speaks HTTPS, so the fake needs TLS (`Bun.serve` with a certificate generated for the run, trusted through `NODE_EXTRA_CA_CERTS`).

### Choosing the recipients

- **Every subscriber:** `select * from push_subscription`.
- **The members of a band:** join through Better Auth's `member` table, which links users to bands (organizations):

  ```sql
  select s.* from push_subscription s
  join member m on m.user_id = s.user_id
  where m.organization_id = :bandId
  ```

  This only reaches members who opted in on at least one device. The others get nothing unless we add a fallback, such as an email through the existing mailer to members with no subscription.

### How the admin sends it

- **An admin page** (global `admin` role) with a form: title, text, optional link inside the app, and a target ("everyone" or "band X"). It calls a route like `POST /api/admin/notifications`, which picks the recipients and sends.
- **A notifications log in Postgres:** a `notification` row (who sent what, to whom) and one delivery row per targeted device (delivered, failed, device gone). It is the audit trail, the place to show the result, and what lets the sending move elsewhere later (see below).

### Where sending runs

Question from Vince: should a Scaleway **Serverless Job** do the sending? A job runs a container to completion, on a cron schedule or when started through Scaleway's API. It can reuse the API's Docker image with another command (same code, database access and VAPID keys), declared in `infra/` like the container, and a run of a few seconds costs next to nothing.

- **Time-based notifications: yes, a job.** A reminder the day before a gig is a daily job: find tomorrow's gigs, send to the members' devices, exit. The same job can take other chores later (expired invitations, orphaned files in storage).
- **Live sends from the admin: not a job, for now.**
  - **Startup.** A job starts its container before sending, probably tens of seconds (not measured): "live" would become "within a minute or so".
  - **A new secret.** Starting a job from a request needs a Scaleway API key allowed to start jobs in the container's environment.
  - **Not needed at beta size.** Sent during the request with limited concurrency, a few hundred devices take a few seconds. A job only pays off at many thousands.
  - **If volume grows, a queue rather than a job.** Scaleway's Messaging and Queuing can trigger the container for each batch, which starts faster than a job.
- **Recommendation: one send function, the trigger changes.**
  1. The function takes subscriptions and a payload, sends with limited concurrency, writes the delivery rows, and deletes dead devices (404 or 410).
  2. **Now:** the admin route calls it during the request.
  3. **With gig reminders:** a scheduled job calls the same function.
  4. **If volume calls for it:** live sends go through a queue or a job. Since the notification and its deliveries are in Postgres, only the trigger changes.

### Points to decide

- **Language.** A free-text message isn't translated. Either the form takes an English and a French version and each device gets the one matching its saved `locale`, or the message goes out as typed.
- **Who may send to a band.** A global admin sending to a band they don't belong to is a step outside the multi-tenancy rule, so it should be a deliberate decision. Letting a **band leader** notify their own band is probably the more common need, and it fits the existing membership check.
- **Volume and the serverless container.** Sending happens during the request. A few hundred subscriptions, sent with limited concurrency (say 20 at a time), finish in a few seconds. Many thousands would need a queue or a job (see [Where sending runs](#where-sending-runs)).
- **Cleanup.** When a send gets 404 or 410 back, that row is deleted right then.
- **"Live" means:** a device that's online typically shows it within seconds, even with the app closed. An offline device gets it when it reconnects, as long as the `TTL` (time-to-live) hasn't expired; set it to a day, for example. Payloads are limited to about 4 KB: send the text and a link, not data.

## Suggested scope for a brief

1. Subscription storage and the opt-in button.
2. Admin broadcast to every subscriber.
3. Sending to a band (leader or admin).
