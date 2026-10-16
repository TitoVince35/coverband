Study posted on Thursday 2026/10/15 21:29

# 003 - REST vs "RPC" in Hono

Answer to Vince's challenge on issue #3: "why are you choosing RPC over standard REST API?"

**Decision: REST API with Hono's typed client, no OpenAPI for now (keep it lean).**

## What "RPC" means here

**RPC stands for Remote Procedure Call**: calling a function that runs on another machine as if it were a local function.

In Hono, "RPC" is the name of a feature, not a protocol. The `hc` client is built from the server's route types (`hc<AppType>`). On the frontend, a call looks like a local function call (`api.bands[":slug"].songs.$get(...)`), which is where the name comes from. Underneath, it sends ordinary HTTP requests to the REST routes.

This is different from real RPC frameworks like tRPC or gRPC, which define their own protocol. We use neither.

Writing "RPC" in issue #3 was misleading; the issue now says "REST API with typed Hono client".

## What it is concretely

The server defines ordinary REST routes:

```ts
const songs = new Hono()
  .get("/bands/:slug/songs", (c) => c.json(listSongs(...)))
  .post("/bands/:slug/songs", zValidator("json", songInput), (c) => c.json(created, 201));
```

On the wire, it's plain HTTP and JSON: resources in URLs, HTTP verbs, status codes. curl, Postman, a future mobile app or a third party can call it normally.

The typed part is only in the frontend:

```ts
const res = await api.bands[":slug"].songs.$get({ param: { slug } });
const songs = await res.json(); // typed from the server code, no codegen
```

That still sends `GET /api/bands/:slug/songs`. The client knows URLs, parameters and response types at compile time: renaming a field on the server breaks the frontend typecheck instead of failing at runtime. This catches AI-generated mistakes before they reach review.

## Alternatives considered

| Option | Pros | Cons |
|---|---|---|
| **REST + Hono typed client** (chosen) | Zero codegen; frontend and backend always in sync | Types only help TypeScript clients. Type inference can slow the editor on very large APIs (much less likely with TS 7). |
| **REST + OpenAPI** (`@hono/zod-openapi`) | Published spec and interactive docs, typed clients for any language; the Hono typed client still works | More verbose route definitions |
| **REST + hand-written `fetch`** | Simple | Types drift silently between server and client |
| **Real RPC** (tRPC, gRPC) | — | Not REST, harder for other clients to call. Not proposed. |

## When to revisit

Switch to `@hono/zod-openapi` if the API needs to be used by others: integrations, a public API, or Claude calling it on a user's behalf. The routes keep the same shape, so the migration is mechanical, but it gets more expensive as the API grows.
