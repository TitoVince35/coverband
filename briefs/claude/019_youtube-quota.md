# 019 - YouTube API: the cost of 10x more searches

> 🕒 Study posted on Wednesday 2026/10/21 22:12

Question from Vince, about "Search and add" ([020_autofill](../vince/020_autofill.md), #200): what does the YouTube Data API cost if we need ten times more searches?

## Short answer

Nothing in money, but more quota can't be bought. The YouTube Data API v3 has no paid tier: each Google Cloud project gets a free daily quota, and the only way to raise it is to ask Google, for free, with no guarantee.

## Today's usage

- Free quota: 10,000 units a day per Google Cloud project (not per key: a development key in the same project shares it).
- One search costs about 101 units: `search.list` (100) plus `videos.list` for the durations and descriptions (1).
- So about 100 searches a day for the whole app, hence the limit of 15 per band and day (`AUTOFILL_SEARCHES`).

Ten times more is about 1,000 searches a day, roughly 101,000 units.

## Getting more quota

- **Audit and Quota Extension Form:** Google reviews whether the app follows YouTube's terms of service, then decides. Third-party guides say it takes a few weeks to several months, approval not guaranteed: ask well before it's needed. No official criteria or timelines found.
- **Per-method quotas:** Google says it is moving to separate quotas for some methods, starting with `search.list`, to make increases simpler.
- **Several projects with their own keys** would multiply the quota, but likely go against the spirit of YouTube's terms, and a review would flag it. Not recommended.

## Recommendation: cache the results first

Cover bands mostly play the same well-known songs, so many searches repeat across bands.

- Keep each search's results in Postgres for a while, keyed by song (`songKey`: title and artist, case and accents ignored). A repeated search costs nothing.
- It fits the stateless server: the cache is in the database, not in memory.
- The per-band limit could then count only real YouTube calls.
- Measure how often searches repeat before asking Google for an extension.

## Sources

- [YouTube Data API revision history (Google)](https://developers.google.com/youtube/v3/revision_history)
- [Is the YouTube API Free in 2026? (Phyllo)](https://www.getphyllo.com/post/is-the-youtube-api-free-in-2026-quota-limits-costs-when-to-pay)
- [YouTube API pricing (Blotato)](https://www.blotato.com/blog/youtube-api-pricing)
- [YouTube API quota (OutlierKit)](https://outlierkit.com/resources/youtube-api-quota/)

Most pricing details come from third-party blogs, some selling alternatives: check Google's own quota documentation before relying on the specifics.
