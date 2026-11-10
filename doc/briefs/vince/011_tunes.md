# Songs concepts

> 🕒 Brief posted on Monday 2026/10/19 02:43

> [!NOTE]
> This document holds concepts for briefs to come. It is not meant to be developed as is.
> Rewritten and settled as [012_songs](012_songs.md).

Any musician can create and update a song in their band's repertoire.

A song comes with:
- Media: links to YouTube videos, Deezer or Spotify tracks...
- Sheets: sheet music (PDF or images), lyrics
- Metadata: style, hotness, readiness...

## Properties, aggregate

A song belongs to a band, has an ID, and is mainly defined by a unique Title + Artist key.

### Properties
- Title
- Artist
- Duration: stored as an integer (seconds), helpful for building setlists
- We may store two optional durations: standard and own. The standard duration is the original timing, which we can pick from the media. The own duration is how long the band takes to play the tune.

### Media

Properties
- Title: "Album version", "Live version 2019", "Guitar tutorial", "Drums only"...
- URL
- Provider: YouTube, Spotify, Deezer... (shown as a logo when possible)
- Instruments (optional)

### Sheet music

Sheet music files are uploaded documents: images, PDF or MuseScore files.

Properties
- Title
- Size: file size
- File: link to the S3 object
- Instruments (optional)

### Metadata

Metadata are optional. They let us sort songs by criteria.
They are ratings, for example from 0 to 5 stars:
- Readiness: how well the band plays the song. Is it ready to play live?
- Hotness, or spiciness: how the audience reacts, how energetic the tune is (rated with chili peppers)

This wording may be challenged.

The style is free text for now.

## Lifecycle, status

Creation

## Design

