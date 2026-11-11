# Accelerate tests

> 🕒 Brief posted on Wednesday 2026/11/11 11:07
>
> 🕒 Brief settled on Wednesday 2026/11/11 14:59
>
> 🕒 Issues completed on Wednesday 2026/11/11 12:01

Local tests are too slow

## Claude's recommandations

What would actually make it faster
1. Run the test files in parallel. Use workers: 2–4 without fullyParallel, so the tests inside each file still run in order. The files probably mostly stay out of each other's way: logins each come from their own client IP, emails and band names are unique per run, and the teardown runs once at the end. The ceiling is the longest file, though: band.e2e.ts alone takes ~50 s, so the whole suite can't drop much below that.
2. Split band.e2e.ts. It's one long serial story: band creation, members, songs, setlists, offline. Turning it into several files, each setting up its own band through the real flows, is what would let extra workers really pay off. It's real work, since today's tests build on each other's data.
3. Skip the rebuild when nothing changed. For example, reuse apps/web/dist and apps/admin/dist locally when you're only changing tests. CI would keep building every time.

Risks to check before raising workers
- Anything that reads shared state: Mailpit searches that aren't filtered by the run's email, and counts across the whole database.
- The fake services (LRCLIB, music, push) are shared by every worker. They're probably fine.
- The second "gated" server on port 3102.

I haven't checked these against the code from here. If you want it, ask in the main conversation: I can try workers: 2 on the existing files and measure before going further.

## What I want to do

1. Check the risks
2. Procede with "workers: 2" and make the measures
3. Go further if wise, up to 6 workers.

## Issues

- [#292 Faster end-to-end tests: parallel files, band.e2e.ts split](https://github.com/TitoVince35/coverband/issues/292)
