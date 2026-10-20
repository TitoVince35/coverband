import { Hono } from "hono";

/** The running release: the version from the root package.json and the commit it was built from. */
export type BuildInfo = { version: string; build: string };

// Liveness probe for the container platform, also read by the deploy workflow to check the new
// build answers. Deliberately does not touch the database: Serverless SQL can take seconds to wake
// up and must not make the container look dead.
export function healthRoutes({ version, build }: BuildInfo) {
  return new Hono().get("/", (c) => c.json({ status: "ok" as const, version, build }));
}
