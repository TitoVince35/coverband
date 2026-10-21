# Song autofill

> 🕒 Brief posted on Wednesday 2026/10/21 20:02
>
> 🕒 Brief settled on Wednesday 2026/10/21 20:02
>
> 🕒 Issues completed on Wednesday 2026/10/21 23:13

Drafted by Claude from [019_overall_feedback](019_overall_feedback.md), settled by Vince.

I'd like to pre-fill some details of a new song from YouTube and Deezer.

- I create a new song with only its artist and title.
- I get 2 buttons: Save, and "I feel lucky".
- "I feel lucky" searches YouTube for my song, trying to select a clean album version, audio only preferably, with high quality (the "Artist - Topic" channels' album tracks first; live versions, covers, karaoke and lyrics videos last).
- I choose among the top 5 proposals, with their thumbnails.
- The same search also looks the song up on Deezer: its duration, album and genre (as the style), and a Deezer link.
- The chosen YouTube video and the Deezer track become the song's first links; the duration and style fill the song's details.

## Decisions

- YouTube Data API (free quota) for the video links, Deezer's public API for the details and its link. No MusicBrainz: an accurate genre isn't that important.
- Quota: 15 searches a day per band.
- YouTube thumbnails pass through our API: no security policy change, and phones never contact Google to show them.
- The YouTube API key (a Google Cloud project) is kept on the server only. Vince creates it; until then, the search shows Deezer's details and link only.

## Issues

- [#203 Song autofill Epic](https://github.com/TitoVince35/coverband/issues/203)
- [#199 Autofill: Deezer lookup and the search route](https://github.com/TitoVince35/coverband/issues/199)
- [#200 Autofill: YouTube search, ranking and thumbnails](https://github.com/TitoVince35/coverband/issues/200)
- [#201 Autofill: "I feel lucky" in the new song dialog](https://github.com/TitoVince35/coverband/issues/201)
- [#202 Autofill: the YouTube API key in production](https://github.com/TitoVince35/coverband/issues/202)
- [#208 Waiting animations on every fetch and mutation; Search and add](https://github.com/TitoVince35/coverband/issues/208)
