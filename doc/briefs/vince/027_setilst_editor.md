# Setlist editor enhancement, and small evolutions

> 🕒 Brief posted on Wednesday 2026/11/11 10:12
>
> 🕒 Brief settled on Wednesday 2026/11/11 10:24
>
> 🕒 Issues completed on Wednesday 2026/11/11 11:06

## Adding songs to a setlist (phones)

I'm not satisfied with the setlist editor on a phone.
Picking songs should be easier, without having to type too much.

Adding songs should be done from a full-screen modal with:
- the title "Add songs"
- a search box
- a sort mode: alphabetical, or energy (then alphabetical), and a direction
- a scrollable list of songs, selectable (checkboxes, or just highlighting if this leaves more room for the song details on a single line)

Cancel / Validate buttons.

### Song details

- Title
- Artist
- Duration
- Energy

A song is displayed in a specific way (warning style?) when it is already in the setlist.

The details should be as condensed as possible so we can display as many songs as possible on the modal.

### Decisions

- **Phones only:** on a large screen, the add-songs panel stays beside the setlist as it is.
- **Selection by highlighting:** tapping the whole row selects it (tinted background and a check icon), no checkboxes.
- **One line per song:** the title in bold, then " · artist" muted, both cut with "…"; the duration and the peppers on the right.
- **Statuses:** "ready" songs by default, with the switch for the songs being learned kept; a song's status shows (a small coloured dot) only when the songs being learned are included.
- **The part to add to:** a compact select kept in the modal's header.
- **Already in the setlist:** still selectable (a medley, a reprise), the row in amber with "Played in Part 1".
- **Sorting:** the repertoire's (`repertoireView`): by title or by energy, with a direction; songs of the same energy keep their title order.
- **Buttons:** Cancel next to the main button, which keeps saying what it does ("Add 3 songs to Part 1"); Cancel never asks for confirmation.

## Small evolutions

### Wording

- "Les setlists et les concerts arrivent bientôt" (EN: "Setlists and gigs are coming soon.") should no longer be displayed, wherever it is used. The band tabs' "Gigs (coming soon)" stays.

### Band activity

- The activity card has a fixed height (3 or 4 entries) cut by a fade-out effect, then "View more". No more accordion.
- "View more" expands the list in place, to the entries the API gives.
- The list should not show bullets: I want to maximize the width available for the text. Entries are told apart by a thin divider.
- The target of an activity entry (song, setlist) is a link to the target's page, an archived one included; a deleted one stays plain text.

### Homepage

On the band's homepage, before "activities", we'll add a new "overview" card with statistics.
- Number of songs
- Number of setlists
- Number of members
- (disabled, as a preview) Number of gigs to come

Each entry has a nice pictogram, with a big number over it and the label under it.

Decisions: the counts include archived songs and setlists; they come from the data the app already has (offline too); each tile links to its page (the repertoire, the setlists, the lineup), the gigs tile shows "—" and "coming soon"; 2 × 2 tiles on a phone, 4 in a row on a large screen.

### Song page

A "History" card shows the activity of the current song only (its documents added and removed included), at most 50 entries, kept offline. It is a folded accordion. The "added by xxx" line stays.

## Issues

- [#287 Setlist editor and small evolutions Epic](https://github.com/TitoVince35/coverband/issues/287)
- [#283 Setlists: add songs on a phone, full screen](https://github.com/TitoVince35/coverband/issues/283)
- [#284 Band home: an overview card, without the "coming soon" line](https://github.com/TitoVince35/coverband/issues/284)
- [#285 Band activity: a fixed-height card, View more, links to its targets](https://github.com/TitoVince35/coverband/issues/285)
- [#286 Song page: a History card](https://github.com/TitoVince35/coverband/issues/286)
