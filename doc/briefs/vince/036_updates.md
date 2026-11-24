# Gigs feedback

> 🕒 Brief posted on Tuesday 2026/11/24 10:45
>
> 🕒 Brief settled on Tuesday 2026/11/24 11:04
>
> 🕒 Issues completed on Tuesday 2026/11/24 11:28

## Setlists

### Display

On the gig's page, the setlist card shows:
- "Setlist" instead of the setlist's title;
- the setlist's info as today (number of songs, duration), plus the number of parts when there is more than one.

### Linking

A gig's setlist is named after the gig: the gig's title, else its venue's name, and its date.

- A gig is never linked to an existing setlist directly: a setlist is linked to one gig only.
- When an existing setlist is picked (a "template"), a copy of it is made, named after the gig, and linked to it. The copy is then edited as any setlist.
- When a new setlist is created for the gig, it is named the same way.
- Once linked, the link never changes: no replacing the gig's setlist, no removing it.
- The setlist is renamed whenever the gig's title, its venue's name or its date changes.

## Gigs, venues and contacts

The sub-menu of the venues and contacts pages (reached from the band's menu) shows Gigs, Venues and Contacts again: the Gigs link removed by 13f1781 comes back.

## Decisions

- **Name:** the gig's title, else its venue's name, then its date: "Le Bar'Hic · 2026-12-05" (the date written the same way in every language, since a title isn't translated). Setlist titles are unique within a band: numbered ("… 2") only if two gigs have the same name on the same day.
- **The copy records its gig** (one setlist per gig, one gig per setlist): only that setlist is ever renamed.
- **No replacement:** once a gig has its setlist, the form no longer offers to pick or create one.
- **Card:** "Setlist" as the heading; songs and duration as today; "3 parts" added when there is more than one; Live.
- **Title locked:** a gig's setlist can't be renamed in the setlist editor ("Named after its gig").
- **A deleted gig** archives its setlist.
- **The band's limit of 50 current setlists** stays as is for now; archiving a gig's setlist once its day is over may come later.
- **A new gig's form:** "Create setlist" is disabled until the form has a title or a venue, with a hint saying why.
- **The setlists page** marks a gig's setlist with the gigs' icon (added after settling).
- **Templates:** the band's current setlists, other gigs' setlists included.
- **Existing gigs** follow the new rules through a migration: every gig linked to a setlist gets its own copy (same parts and songs, archived if the original is), named after the gig and linked to it. The originals stay as they are, as templates. A setlist shared by several gigs thus gives one copy per gig. The migration only adds (a column, then copies), so the release still serving while it runs keeps working.

## Issues

- [#359 Gigs feedback Epic](https://github.com/TitoVince35/coverband/issues/359)
- [#356 Gigs: the Gigs link back beside Venues and Contacts](https://github.com/TitoVince35/coverband/issues/356)
- [#357 Gigs: the setlist card headed "Setlist"](https://github.com/TitoVince35/coverband/issues/357)
- [#358 Gigs: each gig its own setlist, named after it](https://github.com/TitoVince35/coverband/issues/358)
