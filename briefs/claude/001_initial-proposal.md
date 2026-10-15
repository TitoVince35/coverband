# 001 - Initial proposal: technology, hosting, tooling

Answer to [001_initial-brief](../vince/001_initial-brief.md).

The choices aim for three things: low cost, EU hosting, and a stack Claude can generate reliably while we vibe code it.

## Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Runtime / package manager | **Bun** (workspaces monorepo) | As requested. One tool for install, run, test and bundle. |
| Backend | **Hono** on Bun | Small, fast and built for Bun. Its typed RPC client shares API types with the frontend, so no codegen is needed. |
| Database | **PostgreSQL** + **Drizzle ORM** | Schema is TypeScript and migrations are SQL. Simple and well known. |
| Auth + multi-tenancy | **Better Auth** with its *organization* plugin | A band maps onto an "organization": members, roles (leader/musician), email invitations and switching between bands come built in. |
| Frontend | **React + Vite + TanStack Router + TanStack Query** | The best-known ecosystem for AI-assisted coding. Routes and data fetching are type-safe. |
| UI | **Tailwind + shadcn/ui** | Good-looking, mobile-friendly components, with the code in the repo so it can be edited. |
| Validation | **Zod** | Same schemas on the API and in forms. |
| PWA | **vite-plugin-pwa** (Workbox) | Installable app plus offline caching. |
| Quality | **Biome** (lint + format), TS strict, `bun test`, **Playwright** for end-to-end tests | Fast, with little config. |

### Offline use on stage

Venues often have bad signal. Gigs, setlists and songs should be readable offline: cache them with TanStack Query persistence and the service worker. Edits still need a connection. Full offline-first sync is avoided: it multiplies the complexity, and a read-only cache covers the real need.

### Multi-tenancy

One shared database where every business table has a `band_id` column. Hono middleware resolves the active band from the session and every query filters on it. Postgres row-level security can be added later as a safety net.

## Hosting (France / EU, free or cheap)

**Option A (recommended): one small VPS, all in France.**
- **OVHcloud VPS** (France) or **Hetzner** (Germany/Finland), about €4–7/month.
- Run **Dokploy** or **Coolify** on it: open-source, Heroku-like layers on Docker. Push to git and it deploys, with automatic HTTPS and a Postgres container.
- Daily database backups to object storage.
- Predictable cost, no cold starts, no free-tier traps; the box can host other side projects too.

**Option B: serverless at almost zero cost, still in France.**
- **Scaleway** (Paris): Serverless Containers (generous free tier), Serverless SQL Database (Postgres billed per use), Object Storage.
- Close to nothing at low traffic. Downsides: cold starts, some lock-in.

**Either way:**
- Sheet music (PDFs/images) on **Scaleway Object Storage** (France), with presigned uploads.
- Invitation emails through **Brevo** (French, free tier) or **Scaleway TEM**.

Free tiers and prices change often: check current pricing before signing up.

## Forge and CI/CD

- **GitHub** with a public repo: unlimited free Actions, GHCR for container images, Dependabot, best integration with Claude Code.
  - Pipeline: lint → typecheck → test → build image → deploy.
- European alternative: **Codeberg** (Forgejo), with more limited CI.
- License: AGPL to prevent closed hosted copies, or MIT if that doesn't matter.

## Repo layout

```
coverband/
  apps/api        # Hono + Better Auth + ORM
  apps/web        # React PWA
  packages/shared # Zod schemas, types, duration helpers
  docker-compose.yml  # local Postgres
  CLAUDE.md       # conventions for consistency across sessions
```

## Local prerequisites

Docker, Node and git are installed. Missing: **Bun** (`curl -fsSL https://bun.sh/install | bash`) and the **gh** CLI.

## Open questions

1. Hosting: Option A (VPS + Dokploy) or Option B (Scaleway serverless)?
2. Repo: public open source on GitHub, or private?

## Proposed first vertical slice

Auth + creating a band + inviting members. Then repertoire, setlists and gigs.
