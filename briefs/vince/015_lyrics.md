# Lyrics feature

> 🕒 Brief posted on Monday 2026/10/19 17:02
>
> 🕒 Brief settled on Monday 2026/10/19 17:10
>
> 🕒 Issues completed on Monday 2026/10/19 18:14

## Description

A song's lyrics can be held in two ways:

- An uploaded file (camera picture, PDF) tagged as lyrics
- A text "lyrics" field

> [NOTICE] The file upload will be dealt with in a later feature.

The user can edit the lyrics in a text field.

The application will offer an auto-fill service that fetches the lyrics from an online provider. We may also keep a copyright notice or disclaimer, if one is available or required.

## External service

We need to find a free online service that lets us fetch the lyrics we're looking for.

Through a direct API if possible.

If not, using reliable scraping techniques.

## UI

On the song page, add a new "Lyrics" block.

- On a phone, it shows as a closed accordion.
- The block's height should be half a phone screen's standard height.
- If the lyrics are empty, show a "Search lyrics online" button.
- If not, also show:
  - a "View" button that shows the lyrics full screen
  - an "Edit" button that opens the lyrics in a modal for editing

## Search online

Show a modal with a waiting animation (spinner).
When a match is found, preview it; "Use these lyrics" saves it to the lyrics field and closes the modal.
If there are several matches, let the user choose from a curated list (5 at most).

## Decisions

- **Provider:** LRCLIB (free API, no key), called by our API, never by the phone. No scraping: when nothing is found, the lyrics are typed or pasted in. A "Lyrics from LRCLIB" credit shows for fetched lyrics, and we store where the lyrics came from (LRCLIB or typed).
- **Matches:** identical lyrics are merged, ranked by how close their duration is to the song's original duration (5 at most), each shown with album, duration and first line. A match is previewed and saved with "Use these lyrics", never saved automatically. No match: a message and a "Type them in" button.
- **Replace:** the edit modal also offers "Replace from online".
- **Accordion:** closed by default on a phone, open on a wider screen. Opened, its text is half a screen tall and scrolls.
- **Edit modal:** closing it with unsaved changes asks first, like the notes.
- **View (full screen, for the stage):** keeps the screen awake, with font size −/+ remembered on the device.
- Any member edits the lyrics; about 10,000 characters at most; changes show in the band journal.

## Issues

- [#132 Lyrics Epic](https://github.com/TitoVince35/coverband/issues/132)
- [#129 Lyrics field and block](https://github.com/TitoVince35/coverband/issues/129)
- [#130 Search lyrics online (LRCLIB)](https://github.com/TitoVince35/coverband/issues/130)
- [#131 Full-screen lyrics view](https://github.com/TitoVince35/coverband/issues/131)
- [#136 Lyrics: search the web, and instrumentals](https://github.com/TitoVince35/coverband/issues/136)
- [#138 Lyrics: refine the search (free text)](https://github.com/TitoVince35/coverband/issues/138)
