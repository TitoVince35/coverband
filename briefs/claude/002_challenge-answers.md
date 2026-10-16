Study posted on Thursday 2026/10/15 17:28

# 002 - Challenge answers: serverless, ORM, multi-band musicians

Answers to Vince's challenges on [001_initial-proposal](001_initial-proposal.md).

## 1) Is serverless a different way of coding?

It depends on which kind.
- **Functions (Lambda style):** yes, a different model. You write handlers instead of a server, and the code gets tied to the provider. Not recommended here.
- **Serverless containers (Scaleway, Cloud Run):** these run a normal Docker image with our normal Hono HTTP server. The code is the same as on a VPS.

The real differences are constraints, and they're good habits anyway:
- **Stateless:** no sessions in memory, no files on local disk. Sessions go in the database, files in object storage.
- **No in-process background work:** no cron or long-running jobs. Use the provider's scheduled triggers instead.
- **Cold starts:** the first request after a quiet period is slower, typically 1–3 seconds.
- **Database connections:** many short-lived instances can exhaust connections, so a connection pooler is needed.

Coded this way ("12-factor" style), the same image runs on a VPS, Scaleway or anywhere else: no lock-in, and we can move later without rewriting code.

## 2) Prisma or Drizzle?

Both are viable in 2026:
- **Prisma 7 removed the Rust engine**: the client is pure TypeScript, lighter, and works with Bun.
- **Better Auth has adapters for both.**
- **Prisma Client extensions** can inject `bandId` into every query automatically, a good multi-tenancy safety net.

Drizzle's remaining advantages:
- Schema is plain TypeScript, with no `prisma generate` step.
- Raw SQL is more natural to write.
- Zod schemas can be derived from the tables (`drizzle-zod`).

Neither is decisive. Familiarity matters most, since Vince reviews the generated code.

**Decision: Drizzle.**

## 3) Can a musician belong to several bands?

Yes, and it's common with cover musicians. The data model handles it naturally:
- **User:** one global identity (email and login).
- **Membership:** links a user to a band, with a role per band (leader in one, musician in another). Instrument/position lives here too: guitarist in one band, bass player in another. Better Auth's organization plugin already models this.
- **Songs, setlists, gigs** belong to one band and aren't shared. "Copy a song from my other band" could come later.

Design consequences:
- **Band in the URL** (`/b/:bandSlug/setlists/...`) rather than only an "active band" in the session. Several tabs, PWA deep links and shared links work without confusion. The server still checks membership on every request.
- **A personal agenda across all of a musician's bands**: one view of every gig, with clash warnings when two gigs overlap.
