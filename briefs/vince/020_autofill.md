# Song autofill

Drafted by Claude from [019_overall_feedback](019_overall_feedback.md), to review.

I'd like to pre-fill some details of a new song from YouTube and Deezer.

- I create a new song with only its artist and title.
- I get 2 buttons: Save, and "I feel lucky".
- "I feel lucky" searches YouTube for my song, trying to select a clean album version, audio only preferably, with high quality (the "Artist - Topic" channels' album tracks first; live versions, covers, karaoke and lyrics videos last).
- I choose among the top 5 proposals, with their thumbnails.
- The same search also looks the song up on Deezer: its duration, album and genre (as the style), and a Deezer link.
- The chosen YouTube video and the Deezer track become the song's first links; the duration and style fill the song's details.

## Decisions already made

- YouTube Data API (free quota) for the video links, Deezer's public API for the details and its link. No MusicBrainz: an accurate genre isn't that important.

## Open points

- The YouTube API key (a Google Cloud project), kept on the server only.
- The free quota: about 100 YouTube searches a day for the whole app; a limit per user.
- YouTube thumbnails: loaded from Google's servers (a security policy change, and each phone contacts Google), or passed through our API.
