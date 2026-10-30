# Notifications

> 🕒 Brief posted on Friday 2026/10/30 17:05
>
> 🕒 Brief settled on Friday 2026/10/30 17:14
>
> 🕒 Issues completed on Friday 2026/10/30 18:01

Push notifications, first implementation: release notes from the team. Background: [study 022](../claude/022_push-notifications.md) (installed apps, VAPID, subscriptions, where sending runs), agreed.

## Admin

- A "Notifications" menu in the admin app, which lets an admin send a kind of release note, written in a text box, to all the subscribers.

## Client

- It shows at startup in a modal, which can only be closed by clicking an "OK" button.

## Kinds of notifications

- There will be several kinds of notifications. This one is "admin-modal", and it is said to be sent by "the Coverband team".

## Decisions

- **Recipients.** Everyone subscribes before the first release note is sent, so the push alert goes to subscribers and the modal shows to every user (it is stored, not carried by the push).
- **One language.** The text goes out as typed, untranslated.
- **Kind:** `admin-modal`.
- **Signature:** "The Coverband team", written as is (a deliberate exception to the `APP_NAME` rule), in both locales ("L'équipe Coverband").
- **New users** don't see notes sent before their account existed.
- **Read once per user:** "OK" on one device marks it read on all of them.
- **Several unread notes** show one after another, oldest first.
- **When:** at startup and when the app comes back to the foreground (so tapping the push alert, or returning to an open app, shows it).
- **Text:** plain text, line breaks kept, links clickable. No Markdown.
- **Sending:** a preview and a confirmation before "Send to all"; the admin lists sent notes (date, text, devices reached, users who read it). No editing or deleting for now.
- **Order:** the notes and the modal first (no push), then push subscriptions, then the push on send.

## Issues

- [#263 Notifications Epic](https://github.com/TitoVince35/coverband/issues/263)
- [#260 Notifications: team notes in the admin app and the modal](https://github.com/TitoVince35/coverband/issues/260)
- [#261 Notifications: push subscriptions and the opt-in switch](https://github.com/TitoVince35/coverband/issues/261)
- [#262 Notifications: push a team note to subscribers](https://github.com/TitoVince35/coverband/issues/262)
