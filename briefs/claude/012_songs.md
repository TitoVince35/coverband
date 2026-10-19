# 012 - Songs: review and proposal

> 🕒 Study posted on Monday 2026/10/19 03:10

Review of [011_tunes](../vince/011_tunes.md) (songs concepts). The settled brief is [012_songs](../vince/012_songs.md).

## Review

1. **A strict Title + Artist key rejects real songs.** A band may play two versions of a song (acoustic and full), and "The Beatles" vs "Beatles", accents or capitals would slip through anyway. Compare both normalized (like `normalizeName` for instruments) and warn instead of refusing; a second version is told apart by its title, "Creep (acoustic)".
2. **Deleting a song breaks what points to it.** Setlists and gigs will reference songs, and the journal already says who added what. Archiving takes a song out of the repertoire and keeps it everywhere else, restorable.
3. **The standard duration can't be picked from the media for free.** YouTube's and Spotify's APIs need developer keys (Spotify an OAuth app); the free oEmbed endpoints give a title, never a duration. Typed by hand as `m:ss` for now (`formatDuration` exists). Setlists use the band's own duration, else the standard one.
4. **Media are links first.** The provider is detected from the URL (youtube.com and youtu.be, open.spotify.com, deezer.com…), any other URL is a plain "Link"; logos from a free icon set (simple-icons). Embedded players need content security policy work and privacy care (`youtube-nocookie`): later.
5. **Sheet music can't go through the API like avatars** (100 KB): PDFs and photos weigh megabytes. The browser uploads straight to storage with a one-time signed URL handed out by the API (Garage and Scaleway both support it), with a cap per file (e.g. 10 MB) and per band. Allowed types (PDF, JPEG, PNG, WebP, MuseScore `.mscz`) are checked from the content, as for avatars.
6. **Readiness is a status, not a score.** "Is it ready to play live?" has a few answers: proposed, learning, ready. It also gives the song its lifecycle.
7. **Hotness mixed two things:** how energetic the tune is and how the audience reacts. Energy is what helps pace a setlist.
8. **What a cover band musician asks first was missing:** the key (and the band's own key when it transposes), the tempo, and notes ("we skip the 2nd verse", "capo 2").
9. **The journal shows the title by reading the song** (activity rows hold IDs only). Archiving keeps those entries readable; a deleted song's entries say "a song".
10. **Offline on stage** (no network in the venue) will come: sheets and lyrics cached on the phone, linked to the avatar cache idea (#72). Not now, but storage keys and URLs shouldn't rule it out.

## Decisions (Vince)

- **Duplicates:** soft warning ("Already in your repertoire: …, add anyway?").
- **Archive and delete both exist.** Deleting is only allowed while nothing uses the song (no setlist yet); otherwise archive it.
- **Sheet music is an uploaded document, lyrics included:** nobody types lyrics on a phone, they take a picture of a handwritten sheet.
- **Status** (proposed, learning, ready) instead of readiness stars, and **Energy** (chili peppers) instead of hotness.
- **Key, the band's key, tempo and notes** are in from the start.

## Proposal

- **Who:** any member creates, edits, archives and restores; deleting for good is the band leader's, and only for an unused song.
- **Energy:** 1 to 3 chili peppers 🌶️, or not rated. One band-wide value per song, any member changes it.
- **Style:** free text, the band's earlier styles suggested as you type.
- **First epic, without sheet music:** the repertoire and songs, the musical details, status and energy, archiving and deleting, media links. Sheet music upload is the next epic, then offline use.
