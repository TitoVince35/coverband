# Notifications on the home page

> 🕒 Brief posted on Monday 2026/11/23 18:28
>
> 🕒 Brief settled on Monday 2026/11/23 18:30
>
> 🕒 Issues completed on Monday 2026/11/23 18:42

Follow-up to [brief 025](025_notifications.md): today, notifications are turned on only from the "Notifications" card on the Account page (#261), where few users go. Most never turn them on, so they miss the push alerts.

## Feature

- On the mobile app, when the user hasn't turned on notifications on this device, show the notifications request card on the user's home page ("All my bands").

## Background

- The card already exists: `PushCard` (`apps/web/src/components/account/push-card.tsx`), with its states `on`, `off`, `denied`, `install` and `unsupported`.
- The home page already shows a card of the same kind: `InstallCard` (#166), shown until the app is installed or the card is dismissed with its ✕.

## Decisions

- **When it shows:** only in the `off` state (one tap turns them on). `denied` and `install` stay on the Account page.
- **Mobile app:** only in the installed app (standalone). On an iPhone only the installed app gets notifications, and the install card already covers the browser.
- **With the install card:** the install card comes first; the notifications card shows once the app is installed.
- **Dismissable:** a ✕ like the install card, remembered on this device, with a line saying notifications can be turned on later from the Account page.
- **Once turned on:** the card leaves the home page (with the "Notifications turned on" toast) and stays on the Account page, to turn them off.

## Issues

- [#353 Notifications: offer them on the home page](https://github.com/TitoVince35/coverband/issues/353)
