# Initial brief - Coverband

> 🕒 Brief posted on Thursday 2026/10/15 17:28
>
> 🕒 Brief settled on Thursday 2026/10/15 17:28
>
> 🕒 Issues completed on Friday 2026/10/16 11:16

I want to create an application to help music groups in their activities.

## Non exhaustive list of what topics we will address
- Musical repertoire : every song the band plays (title, artist, links to online media, partitions, duration)
- Gigs : planned shows, dates, venues, setlists
- Setlists : reusable sets of songs, splitable in parts, with approximative duration
- Band : name, members (musicians)

## Application characteristics and constraints

- Application name : coverband
- Application title : "CoverBand"

### Typology
- Coverband is an online application designed for web browsers (desktop and mobile).
- End target : progressive web app that can be installed.
- Multi-tenant : one band has its own private data, musicians are users in that band's universe.

### Constraints
Hosting and software forge: free, or very cheap.
Technology: preferably Typescript based (backend and frontend) with bun.
May be opensource to benefit free CI/CD and hosting offers.
Preferred prduction hosting in France, or Europe if possible.

## Issues

- [#1 Scaffold Bun monorepo](https://github.com/TitoVince35/coverband/issues/1)
- [#2 Local Postgres + Drizzle setup](https://github.com/TitoVince35/coverband/issues/2)
- [#3 Hono API skeleton](https://github.com/TitoVince35/coverband/issues/3)
- [#4 React PWA skeleton](https://github.com/TitoVince35/coverband/issues/4)
- [#5 CI with GitHub Actions](https://github.com/TitoVince35/coverband/issues/5)
- [#6 Authentication: email/password login, no public sign-up](https://github.com/TitoVince35/coverband/issues/6)
- [#7 Band lineup and musician invitations](https://github.com/TitoVince35/coverband/issues/7)

Not listed: the product backlog created with this brief (#8 to #12), followed by later briefs.
