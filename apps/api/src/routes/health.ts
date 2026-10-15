import { Hono } from "hono";

// Liveness probe for the container platform. Deliberately does not touch the database:
// Serverless SQL can take seconds to wake up and must not make the container look dead.
export const health = new Hono().get("/", (c) => c.json({ status: "ok" as const }));
