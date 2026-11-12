# Viewing setlists live

> 🕒 Brief posted on Thursday 2026/11/12 17:03
>
> 🕒 Brief settled on Thursday 2026/11/12 17:17

A setlist can be viewed in a "live mode":
- read-only
- offline
- full screen
- with easy one-touch access to:
    - lyrics
    - documents

## Songs display

The songs are shown in a scrollable list.

### Page structure

```xml
<Header/>
<Part1>
    <PartHeader/>
    <Song1/>
    <Song2/>
    ...
    <SongN/>
</Part1>
...
<PartN/>
```

### Header

The header is a table with 2 columns:
- Band logo (1/3 width max when rectangular)
- Setlist info on 2 lines:
    - Setlist title | Creation date
    - Band name | Total number of songs | Total duration

### PartHeader

The part header contains:
- Part title
- Part duration

### Song

The song component is a table with 2 columns:
- Song index (in its part)
- Song info and buttons:
    - First line: Title (bold) - Artist
    - Second line: Tempo - Key - Buttons

## Easy access buttons

- A lyrics button (e.g. a mouth icon) opens the lyrics full screen, when the song has lyrics.
- One button for every available, qualifying document.
- A qualifying document is a document that can be opened on the device.
- When a document is tagged with an instrument, its button shows "instrument icon + instrument name".
- When a document is untagged, its button shows a short version of the document's title.

## Claude's recommendations (settled)

What the app already has: every setlist, every song's lyrics, and songs' photos and PDFs are kept on the phone for offline use; the full-screen lyrics view keeps the screen awake, with its text size and capitals (#296).

1. **Full screen:** Safari can't put a page in true full screen on an iPhone (only video), and the installed app already has no address bar. Live mode is a page covering the whole app (no header, no bottom bar), with an exit button; on Android, real full screen too. The screen stays awake while it's open.
2. **Header:** compact, and it scrolls away with the songs: the band's logo small (its thumbnail, as tall as the two lines), the setlist's title, then the band's name, the number of songs and the total duration. No date: not useful on stage.
3. **Previous and next song:** the lyrics view opened from live mode has Previous and Next buttons, moving to the previous or next song, following the setlist's order across parts (a song without lyrics says so, so the set's order stays visible), without going back to the list. Documents don't get them.
4. **Which documents:** the member's own instruments' documents and the untagged ones, with an "All" switch remembered on the phone.
5. **Opening a document:** photos only, in a full-screen viewer inside the app, closed by a big button (no new tab, the list keeps its place). No PDF in this first version: a PDF reader inside the app would add about 1 MB to it, and opening the browser's viewer leaves the app.
6. **Qualifying document:** a photo the phone can open now: online, any; offline, only those saved on the phone (up to 100 MB of documents in total, newest first). Other documents have no button: no disabled buttons.
7. **Buttons:** at least 44 px, wrapping to a third line when a song has many. A document's button: its instrument's icon and name (the member's own first when it's tagged with several), plus a short title when two buttons would read the same. A short title is about 12 characters, cut with "…".
8. **Lyrics button:** a singer's microphone (`mic-vocal`), named "Lyrics" for screen readers, shown only when the song has lyrics.
9. **Notes:** the song's notes on a small line under it, expandable with a tap when they're longer.
10. **Entering live mode:** a "Live" button beside Print on the setlist's page, enabled offline (unlike Print), archived setlists included. No editing in live mode.
11. **Text size:** fixed in the list (a large title); the lyrics view keeps its own −/+ and capitals.

Not for now (kept simple): marking the song being played, following another member's screen.

## Issues

- [#310 Live setlists Epic](https://github.com/TitoVince35/coverband/issues/310)
- [#307 Live setlists: the live mode page](https://github.com/TitoVince35/coverband/issues/307)
- [#308 Live setlists: lyrics, with previous and next song](https://github.com/TitoVince35/coverband/issues/308)
- [#309 Live setlists: documents (photos) for my instruments](https://github.com/TitoVince35/coverband/issues/309)
