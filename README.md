# CoverBand

[![CI](https://github.com/TitoVince35/coverband/actions/workflows/ci.yml/badge.svg)](https://github.com/TitoVince35/coverband/actions/workflows/ci.yml)

An installable web app (PWA) to help music bands manage their activities: repertoire, setlists, gigs and members.

## Status

Early stage: technical choices are being made. See [`briefs/`](briefs/) for the project's decision trail:
- `briefs/vince/`: product briefs
- `briefs/claude/`: technical proposals and answers

## Planned stack

TypeScript and Bun end to end: Hono API, React + Vite PWA, PostgreSQL with Drizzle, Better Auth. Hosted on Scaleway (Paris).

## Development

Requires [Bun](https://bun.sh) 1.4+ and Docker.

```sh
bun install
cp .env.example .env # then fill BETTER_AUTH_SECRET and ADMIN_PASSWORD
bun run db:up       # local Postgres, Mailpit (emails at http://localhost:8025) and Garage (S3 storage, web UI at http://localhost:3909)
bun run db:migrate
bun run check       # lint + typecheck + tests
bun run dev         # API on :3000, web app on :5173, Drizzle Studio (database button in the header)
```

Log in at http://localhost:5173 with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`. There is no public sign-up: accounts come from invitations.

## License

[AGPL-3.0](LICENSE)
