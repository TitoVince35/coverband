# 014 - Lyrics: provider, search flow and UI

> 🕒 Study posted on Monday 2026/10/19 17:10

Answer to [015_lyrics](../vince/015_lyrics.md). The decisions taken from it are in the brief's `## Decisions` section.

## The provider

1. **No scraping.** Lyrics sites forbid it in their terms, and it's the riskiest way to copy copyrighted text. It breaks whenever their HTML changes, and requests from a cloud server get blocked. When the API finds nothing, the fallback is typing or pasting the lyrics in.
2. **LRCLIB** ([lrclib.net](https://lrclib.net)) is the only free option worth using.
   - Tested on 2026/10/19: no key needed, and `GET /api/search?track_name=…&artist_name=…` returns the plain lyrics with the album and duration (timed lyrics too).
   - Its lyrics come from its community, with no licence from the rights holders.
   - The alternatives: Musixmatch, LyricFind and the other licensed providers are paid, or give only part of the lyrics on free plans. Genius's API doesn't return lyrics.
3. **Copyright.** A band's lyrics stay private to it, which is close to a member typing them out. That's a reasonable risk for a beta among friends; a public product would need a licensed provider. LRCLIB gives no copyright notice to show, so we show a "Lyrics from LRCLIB" credit and store where the lyrics came from.
4. **Called by our API, not the phone.** The API checks band membership, identifies the app to LRCLIB (`User-Agent`) and applies a rate limit. It doesn't cache anything (the server keeps no state between requests). The provider is an adapter behind an interface, like mail and storage, with a fake for tests.

## Search flow

5. **Never save the first match automatically.** "Zombie" by The Cranberries returns 20 entries (a live version, compilations, lengths from 1:22 to 5:15), so a wrong version could land silently. A match is previewed and saved with one tap on "Use these lyrics".
6. **Ranking:** entries with identical lyrics are merged, then ranked by how close their duration is to the song's original duration (5 at most). Each match shows album · duration · first line.
7. **No match:** a message and a "Type them in" button that opens the editor.
8. **Replace:** the edit modal also offers "Replace from online".

## UI

9. **Accordion:** closed by default on a phone, open on a wider screen. Opened, its text is half a screen tall and scrolls.
10. **Edit modal:** long text, so a modal (full screen on a phone) rather than in place like the notes. Closing it with unsaved changes asks first.
11. **View (full screen, used on stage):** keeps the phone's screen from sleeping (Wake Lock API), with font size −/+ remembered on the device. Scrolling in time with the music is possible later with LRCLIB's timed lyrics.
12. **Smaller points:** any member edits the lyrics; about 10,000 characters at most; changes show in the band journal. The file upload is a later feature.
