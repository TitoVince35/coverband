# CoverBand

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
cp .env.example .env
bun run db:up       # local Postgres
bun run db:migrate
bun run check       # lint + typecheck + tests
bun run dev         # API on :3000, web app on :5173
```

## License

[AGPL-3.0](LICENSE)
