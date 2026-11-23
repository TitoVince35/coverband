# Gigs

> 🕒 Brief posted on Sunday 2026/11/22 23:37
>
> 🕒 Brief settled on Monday 2026/11/23 00:42
>
> 🕒 Issues completed on Monday 2026/11/23 10:47

Bands have gigs. They play shows at places on dates.

A band member creates a gig with the default status "proposed".
It must have a date and either a title, a venue, or both.

All the rest is optional.

We can create venues and contacts, and upload posters, from the gig's form. The band's venues and contacts also have pages of their own, to manage them.

## Gig data

- date
- title
- type: public concert, private event, recording
- status: proposed / settled / cancelled
  - when cancelled: the reason, who cancelled it and when (fields of their own, shown at the top of the gig)
- created by (the member who created it)
- venue (its own table, owned by the band)
  - name
  - city
  - address
  - coordinates, to show it on an OpenStreetMap map
  - web links
  - description
  - contacts: the venue's usual people (the booker, the sound engineer…), from the band's contacts
- linked setlist
- show time
- program:
  - web links to the show's advertising
  - free text (running order, occasion)
- contacts (their own table, owned by the band)
  - name
  - type: organizer, technical, musician (several of each type possible)
  - phone number
  - email address
  - free text
- posters: image, title
- extra info
  - get-in time
  - pay: an amount in € + optional free text
  - shared backline (checkbox + description)
  - technicians provided (checkbox)
  - free text (the gig's notes)

## Form description

The form is a page of its own (it's long), not a dialog. Its Save button stays at the bottom of the screen and says what is missing (a title or a venue).

### Venue

The venue shows as an empty field: a search box on the band's venues, followed by a "+" button.

All the venue's other fields are hidden.

- When a venue is chosen, its details show, filled in and editable, its name and city included.
- When the "+" button is pressed, all the fields show, editable.
- Changing a venue's details changes them for every gig of the band at that venue (the form says so).

As soon as the required fields are filled in (name and city), the new venue can be saved along with the gig.

### Setlist

A setlist selector shows the band's setlists that are not archived.
It is followed by a "Create setlist" button: the new setlist opens in the editor, then comes back to the gig.

### Contacts

The gig's contacts are a list. If the list has at least one entry, it shows a "Contacts" title.

- **The venue's contacts are linked, not copied:** the gig shows its venue's contacts automatically ("From the venue"), then its own ("This gig"). A changed phone number is changed everywhere; a gig moved to another venue shows the new venue's contacts.
- An entry shows its type as a badge, then name, phone and email on one line.
- The list is followed by an "Add contact" button (all you see when the list is empty).
- Adding or editing a contact is done in a dialog. Required fields: name and type. The name field suggests the band's contacts as you type, so one person isn't entered twice. A checkbox, "Also a contact of the venue", adds them to the venue instead of this gig alone.

### Posters

The band can upload up to 5 images for the gig, 5 MB each. Each poster can be downloaded and shared (the phone's share sheet), to post it on social networks.

## The map

The venue's coordinates come from its address, found by OpenStreetMap's geocoding service (Nominatim), called by our API, never by the browser: one request per address saved, within Nominatim's usage policy (at most one request a second, the app named in its requests), its answer kept with the venue. The pin can then be dragged on the map to correct it. The map shows OpenStreetMap's tiles, credited.

Without coordinates (an address not found, Nominatim out of reach), the venue simply has no map; its address and the "Directions" link (the phone's maps app, from the address) are always there. Offline, the map doesn't show; the Directions link stays.

## The band's venues and contacts

Two pages, reached from the band's menu (and the gigs page):

- **Venues:** the band's venues with their city and number of gigs, a search; each opens its form (every field, its contacts, its gigs). A venue is deleted only when no gig uses it.
- **Contacts:** the band's contacts with their type, phone, email, and where they're used (a venue, n gigs), a search; each opens its dialog. **Deleting a contact** removes it from every gig and venue, confirmed: these are other people's personal details, so the band must be able to remove them. **Merging** two contacts (the same person entered twice) keeps one set of details and puts it everywhere the other was used.

## Life cycle

Any band member can create a gig and edit it.

Its **creator or the band leader** settles, postpones, cancels and deletes it.

- **Proposed:** anything can change. It becomes "settled" through the status switch in the form.
- **Settled:** the date, title and venue are fixed. Postpone brings it back to "proposed" to change them.
- **Cancelled:** no longer editable; it shows the reason, who cancelled it and when.
- **Delete:** a proposed gig is deleted directly; a settled one is cancelled first. Deleting a gig keeps its venue and contacts in the band's lists.
- **Past gigs** are read-only (see "A gig's day"); their creator or the band leader can still delete them, so a mistake can be removed.

### A gig's day

Gigs often go on past midnight. A gig's day runs from midnight on its date **until 6 AM the next morning**, local time:

- **Today's gig:** its date is today, or it was yesterday and it's not 6 AM yet (a Saturday night gig is still "today's" at 2 AM on Sunday).
- **Upcoming:** its day hasn't started yet (it's today's gig in the meantime, not upcoming).
- **Past:** its day is over (6 AM the day after its date); it is then read-only, except for Delete (its creator or the band leader).

One shared rule decides it everywhere (the lists, the home cards, the API's read-only check): the 6 AM cut-off in one place, tested at its edges (5:59 and 6:00, midnight, a gig on the 31st). The local time is the device's: the API uses the time zone the app sends, as the setlist exports already do.

### Events of interest

The following events are logged (the band's journal):

- gig created
- gig settled
- gig postponed
- gig cancelled
- gig deleted
- contact added
- poster added
- program link added
- program updated

A gig settled and a gig cancelled also send a push notification to the band's members (the push notifications already in the app).

### Relation to setlist

A gig links to at most one setlist, chosen among the band's current setlists (or created from the form). An archived setlist stays linked; a deleted setlist leaves the gig without one. The gig's compact view shows it with its duration and a "Live" button opening the live mode.

## Offline

Gigs are kept on the phone for offline use, like setlists: on the day, the venue's network is often poor. The compact view and the home cards work offline (read-only, like the rest of the app offline): venue, address and Directions link, contacts with their Call and Email buttons, times, setlist, extra info. Posters' images are online only.

## Components

### Band home: today's gig card

- Title: "Today's gig"
- A compact summary of each gig of the day (there can be several): title, city, get-in and show times, the setlist; "View the gig" and "Live setlist" buttons.
- Shown only when at least one gig is today, in the sense of "A gig's day": until 6 AM the day after its date.

### Band home: upcoming gigs card

The upcoming gigs card is shown on the band's home page.

- Title: "`nn` upcoming gigs" (`nn` is the total number of upcoming gigs)
- List: up to 5 gigs, the soonest first.
- Hidden when no gig is to come.
- The "gigs to come" number of the band's overview becomes a link to the gigs page.

### Gigs page

The list of gigs, each with:

- the date
- the city
- the venue's name

Filter: Next (default: today's and upcoming gigs), Past, All, by "A gig's day".

A cancelled gig is shown crossed out and can't be edited.

Available actions:

- View (the default action when tapping the row): opens the compact view
- Edit
- Cancel: asks for the reason, then sets the gig cancelled.
- Postpone: sets the status back to "proposed", then opens the form with the cursor on the date field.
- Delete: directly for a proposed gig, after cancelling for a settled one.

### Edit gig

See the Form description section.

### Compact view

What a member needs on the day, read-only:

- status and type, title, date, get-in and show times
- the venue: name, address, its map and a Directions link
- the setlist, with its duration and a "Live" button
- the contacts (the venue's, then the gig's), each with Call and Email buttons
- "Good to know": the pay (every member sees it), the shared backline, technicians provided, then the notes
- the posters, each with Download and Share
- Edit and the gig's actions in the header

## Vocabulary

In French: a gig is « un concert » (the app's « Concerts » already). Statuses: « Proposé », « Confirmé », « Annulé ». Types: « Concert public », « Événement privé », « Enregistrement ». Contact types: « Orga », « Technique », « Zicos ». Extra info: « Infos pratiques » (« Bon à savoir » on the compact view), pay « Cachet », get-in « Arrivée »; « backline » stays as it is. Actions: « Reporter », « Annuler le concert », « Supprimer ».

## Design

The design (English and French pages): https://claude.ai/artifact/BJrctgKhFsqxtgA6igoc7n

## Issues

- [#335 Gigs Epic](https://github.com/TitoVince35/coverband/issues/335)
- [#326 Gigs: create, list and edit a gig, with its venue](https://github.com/TitoVince35/coverband/issues/326)
- [#327 Gigs: settle, postpone, cancel and delete](https://github.com/TitoVince35/coverband/issues/327)
- [#328 Gigs: setlist, program and extra info](https://github.com/TitoVince35/coverband/issues/328)
- [#329 Gigs: contacts, and the venue's contacts](https://github.com/TitoVince35/coverband/issues/329)
- [#330 Gigs: posters](https://github.com/TitoVince35/coverband/issues/330)
- [#331 Gigs: today's and upcoming gigs on the band home](https://github.com/TitoVince35/coverband/issues/331)
- [#332 Gigs: offline, read-only](https://github.com/TitoVince35/coverband/issues/332)
- [#333 Gigs: the venue on a map](https://github.com/TitoVince35/coverband/issues/333)
- [#334 Gigs: the band's venues and contacts pages](https://github.com/TitoVince35/coverband/issues/334)
