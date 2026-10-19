# Songs

> 🕒 Brief posted on Monday 2026/10/19 03:10
>
> 🕒 Brief settled on Monday 2026/10/19 03:10

Rewrite of the [songs concepts](011_tunes.md) with the decisions from the [review](../claude/012_songs.md).

A band's repertoire is its list of songs. Any member can add a song, edit it, archive it and restore it.

A song comes with:
- its properties: title, artist, durations, key, tempo, style, notes;
- its status and energy, to sort the repertoire and build setlists;
- media: links to YouTube videos, Spotify or Deezer tracks…;
- sheet music: uploaded documents (later).

## Song

A song belongs to a band and has an ID. It is mainly identified by its title and artist.

- **Title** and **artist** (required).
- **Duplicates:** a song whose title and artist match one already in the repertoire (ignoring case, accents and extra spaces) gets a warning ("Already in your repertoire: …, add anyway?"), not a refusal. A second version is told apart by its title: "Creep (acoustic)".
- **Durations** (optional), typed as `m:ss`, stored in seconds:
  - **standard:** the original timing;
  - **own:** how long the band takes to play it.

  Setlists will use the own duration, else the standard one.
- **Key** (e.g. "E minor") and the **band's key** when it transposes (optional).
- **Tempo** in BPM (optional).
- **Style:** free text, with the band's earlier styles suggested as you type (optional).
- **Notes:** free text ("we skip the 2nd verse", "capo 2") (optional).

## Status and energy

- **Status:** proposed → learning → ready. A new song starts as proposed.
- **Energy:** 1 to 3 chili peppers 🌶️, or not rated. It helps pace a setlist.
- One band-wide value for each, which any member can change.
- The repertoire sorts and filters on them.

## Archive and delete

- **Archiving** takes a song out of the repertoire and keeps it in setlists, gigs and the journal. Any member can archive and restore; archived songs are listed apart.
- **Deleting** is for good, by a band leader, and only while nothing uses the song (no setlist yet). A song in use can only be archived.

## Media

A song's links, each with:
- **URL**;
- **provider**, detected from the URL: YouTube, Spotify, Deezer…, shown with its logo; any other URL is a plain link;
- **title** (optional): "Album version", "Live version 2019", "Guitar tutorial", "Drums only"…;
- **instruments** (optional), chosen with the instrument picker.

## Journal

The band's journal shows song events: added, updated, archived, restored, deleted ("Lea added song Creep"). The title is read from the song, so a deleted song's entries say "a song".

## Future paths

- **Sheet music** (next epic): uploaded documents — PDF, photos (a handwritten sheet or lyrics), MuseScore files — each with a title, its file size and optional instruments. Uploaded straight to object storage with a one-time signed URL, the type checked from the content, a cap per file (e.g. 10 MB) and per band.
- **Offline on stage:** sheet music and song details cached on the phone for venues without network.
- **Durations picked from the media**, through the providers' APIs (needs developer keys).
- **Embedded players** for media (YouTube without cookies).
- **Setlists and gigs**, which will use songs, durations and energy, and make a song "in use".

## Issues

- [#93 Songs Epic](https://github.com/TitoVince35/coverband/issues/93)
- [#88 Songs and the repertoire](https://github.com/TitoVince35/coverband/issues/88)
- [#89 Song details: key, tempo, style, notes](https://github.com/TitoVince35/coverband/issues/89)
- [#90 Song status and energy](https://github.com/TitoVince35/coverband/issues/90)
- [#91 Archive and delete songs](https://github.com/TitoVince35/coverband/issues/91)
- [#92 Song media links](https://github.com/TitoVince35/coverband/issues/92)
