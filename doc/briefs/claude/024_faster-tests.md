# 024 - Faster end-to-end tests: study

> 🕒 Study posted on Wednesday 2026/11/11 11:09

Answer to [029_faster_tests](../vince/029_faster_tests.md): check the risks of running the Playwright files in parallel, try `workers: 2`, measure, go further (up to 6) if wise. Updated as the study progresses.

Work happens in a separate worktree (`../coverband-029`, branch `029-faster-tests` off `dev`), so it never touches the folder another session works in. One shared constraint remains: the end-to-end suite uses fixed ports (3100 to 3104), the local Postgres and Mailpit, and its teardown deletes every `@e2e.localhost` user and "E2E " band, leftovers included. **Two suites must never run at the same time**, whatever the worktree: each run is started only after checking the ports are free.

## 1. The risks, checked against the code

| Risk | Verdict |
| --- | --- |
| Logins (rate limited per client IP) | Safe: each `login()` comes from a random `x-forwarded-for`. |
| Emails, band names | Safe: unique per run (`E2E_RUN`), and every Mailpit search is filtered by recipient (`invitationLink()`, `contact.e2e.ts` on its own recipient). |
| Teardown | Safe: global, runs once after every worker. |
| Per-user rate limits (invitations 20/h, songs 30/h, contact 5/day, autofill) | Safe: only the admin invites (in `band.e2e.ts` alone), other limits hit distinct users. Still worth keeping in mind if `band.e2e.ts` is split: each file setting up its own band makes the admin send one more invitation (20 per hour leaves room). |
| Fake LRCLIB and music services | Safe: stateless. |
| Fake push service | Safe: it keeps what it received, but `push.e2e.ts` filters by its own endpoint id. |
| Gated server (3102) | Safe: only `access.e2e.ts` uses it, with its own client address. |
| The shared admin (`ADMIN`) logged in from several files at once | Safe: each login is its own session; logging out (`auth.e2e.ts`) ends only that one. |
| Counts across the database | None found that would change: the admin app's numbers are only checked for their labels; `band.e2e.ts` counts its own band's songs and setlists. |
| **Notes from the team** (`notifications.e2e.ts`, and the second test of `push.e2e.ts`) | **Conflict.** A note is sent to *every* user and opens as a modal dialog at the next page load, until OK. Running at the same time as another file, it would cover that file's pages (the admin's, or the band leader's and musician's in `band.e2e.ts`) and block their clicks. And the two note files would see each other's notes. |

So everything can run in parallel except the two files that send notes: they run after all the others, one after the other.

Done in `e2e/playwright.config.ts`: two projects, "phone" (every file but the notes, in parallel) and "phone notes" (`notifications.e2e.ts`, `push.e2e.ts`), which depends on the first and has `workers: 1`. Side effect: running a notes file alone (`bun run e2e push.e2e.ts`) runs the "phone" project first; `--no-deps` skips it. The root `CLAUDE.md` says so.

## 2. Measures

Whole suite, `bun run e2e`, wall clock on this computer (16 cores), all 37 tests green each time.

| Run | Wall clock |
| --- | --- |
| Baseline: `workers: 1` | 68 s |
| `workers: 2`, notes after the rest | 65 s |
| + the two toast waits removed (below) | **56 s** |
| Same, `workers: 4` | 55.5 s |

Where the time goes (baseline): ~6 s to build and start the servers, then the tests. `band.e2e.ts` alone is ~45 s; every other file together is under 15 s.

- **The build costs ~2 s** (both Vite builds take 0.5 s each). Reusing `dist/` (the brief's option 3) isn't worth it.
- **More workers alone change nothing**: `band.e2e.ts` is one serial story and stays on the critical path; with 2 workers the other files are done long before it.
- **Two clicks waited ~4 s each for a toast to go away.** Traces showed it: toasts open `top-center` (`apps/web/src/routes/__root.tsx`), which on a phone is right over the header, so a click on the theme button or the Account menu waits until the toast disappears. Fixed test-side: the theme test starts on a fresh page (it doesn't need the previous step's page), and `push.e2e.ts` opens the Account menu from the keyboard. ~9 s saved.

## 3. `band.e2e.ts` split (#292)

Vince: "split it hard". The 1,250-line serial story became nine files, each with its own band, so they no longer wait for each other:

| File | What it tests |
| --- | --- |
| `onboarding.e2e.ts` | Through the screens: the admin invites a band leader, who creates the band, invites a musician who joins; the admin finds the band; profile, instruments, the band's activity |
| `band-admin.e2e.ts` | The admin app and a band: the band leader kept out (#246), viewed as (#249), the band suspended then deleted (#248) |
| `band.e2e.ts` | The band's pages: sections (#223), skeleton (#190), logo |
| `account.e2e.ts` | Avatar, colour theme |
| `songs.e2e.ts` | Songs added, the duplicate warning, Search and add, details, notes, status, energy, history, sorting, journal, archive, delete |
| `lyrics.e2e.ts` | Lyrics found online, edited, full screen; an instrumental |
| `song-media.e2e.ts` | Links, documents (and their history) |
| `setlists.e2e.ts` | #271 to #273, the band's numbers (#284) |
| `offline.e2e.ts` | Offline (#165), logging out and in again (#174) |

How a file gets its data, in `support.ts`:

- `newBand(browser, name)`: the run's admin signs in and invites a band leader (`/api/admin/invitations`), the invitation link is read from Mailpit, the band leader accepts it (`/api/invitations/:token/accept`, which logs them in). The same requests as the admin app and the wizard, without their screens: those stay tested once, in `onboarding.e2e.ts`. About 1 s.
- `addSong()`, `addSetlist()`: the API, when the screens aren't what the file tests (offline needs a song with lyrics, a photo and a setlist; it no longer depends on the songs and setlists tests having run before).
- `savedCount()`, `savedCopy()` (what the app saved on the device) moved there too, shared by `band.e2e.ts` and `offline.e2e.ts`.

Each file's band leader is "Lea Leader" (no nickname), so the texts checked changed from "Captain Lea" outside `onboarding.e2e.ts`. The admin invites one band leader per file: 9 per run, under the 20 per hour limit, which counts per admin, and each run has its own admin.

## 4. Measures after the split

Whole suite, `bun run e2e`, 45 tests (the split added a few), all green on every run, no leftovers in the database after the teardown.

| Workers | Wall clock | CPU, whole computer (16 cores): average, peak |
| --- | --- | --- |
| 2 | 40.6 s | 27%, 46% |
| **3** | **31.0 s** | **37%, 69%** |
| 4 | 27.0 s | 45%, 83% |
| 6 | 24.8 s | not measured |

CPU sampled every second during the run (idle: under 10%). The peak comes in the first seconds, when every worker launches its browser and sets up its band at once.

Chosen: **3 locally, 2 in CI** (`workers: ci ? 2 : 3`). Vince's limit: never over 70% CPU on this computer; 4 goes to 83% for a few seconds, for 4 s saved. CI's runners have 4 cores for the server, the fakes and the browsers: to check on the PR's CI run.

**From 68 s to 31 s**, under 70% CPU. The longest files are now 7 to 10 s each; going further would mean cutting them again, for little.

## Open question

Product question raised by the traces: on a phone, a toast covers the header (Account menu, theme, back) for its 4 s. A user tapping Account right after "Notifications turned on" taps the toast. Move toasts to `bottom-center` on small screens (above the bottom bar), or keep `top-center`? (Screenshot shown to Vince on 2026/11/11.)

## 5. Toasts at the bottom on a phone

Vince's decision: toasts move to `bottom-center` on a phone, above the band's bottom bar; `top-center` stays on larger screens. Below Tailwind's `sm` (640 px, where the bottom bar gives way to tabs), `__root.tsx` sets the position from a `useMediaQuery()` hook (`lib/media-query.ts`), with a bottom offset of `4.5rem` plus the phone's safe area. `band.e2e.ts` checks that a toast on a band page sits between the middle of the screen and the bottom bar. The two test workarounds of section 2 are gone: the clicks no longer wait.

## 6. On GitHub

The latest CI runs (2026/11/11), per push: about 3 min, as the end-to-end job only starts once the check job is done.

| Job | Duration | Of which |
| --- | --- | --- |
| Lint, typecheck, test, build | ~60 s | containers 9 s, typecheck 9 s, object storage 9 s, tests 15 s, build 5 s |
| Production image and infrastructure | ~30 s | image 20 s |
| End-to-end tests (after the first job) | ~120 s | containers 11 s, object storage 11 s, Chromium 8 s, **tests 85 s on 1 worker** |

What speeds it up:

1. **Workers in CI.** The runner has 4 cores, shared by the API, the fakes and the browsers. 2 is the prudent value set in the config; 3 or 4 may be faster or may make tests flaky. Measured only on a real runner (below).
2. **The end-to-end job alongside the others** (no more `needs: check`): the run takes as long as its longest job, ~1 min less. The cost: when lint or a unit test fails, the end-to-end job still runs (runner minutes), and both failures show at once.
3. **Playwright's Chromium cached** (`actions/cache`, keyed on `e2e/package.json`, where Playwright's version is): up to 8 s.

Not worth it: sharding the tests over several jobs. Each job pays ~35 s of setup (containers, object storage, install, build) for ~45 s of tests.

Expected: from ~3 min to **~1.5 min** per run, depending on the workers measured.

### Workers measured on GitHub's runners

A temporary commit ran the end-to-end job six times side by side (2, 3 and 4 workers, twice each; PR #294, 2026/11/11). The tests step (build and server start included):

| Workers | Run 1 | Run 2 |
| --- | --- | --- |
| 2 | 74 s | 60 s |
| **3** | **57 s** | **54 s** |
| 4 | 77 s | 70 s |

Before: 85 s on 1 worker. Chosen: **3, on CI as locally** (`workers: 3`): 4 is slower on a 4-core runner, as the API, the fakes and the browsers compete for it.

One run failed, and not because of the workers: in `song-media.e2e.ts`, the second "Document added" toast came while the first still showed, so the text matched twice. Fixed (`.last()`, as the lyrics test already did with `.first()`).
