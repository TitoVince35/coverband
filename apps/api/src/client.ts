import { hc } from "hono/client";
import type { AppType } from "./app";

/**
 * Typed client for the REST API (what Hono calls "RPC"): requests stay plain HTTP + JSON.
 * See briefs/claude/003_rest-vs-rpc.md.
 */
export function createApiClient(baseUrl: string, options?: Parameters<typeof hc>[1]) {
  return hc<AppType>(new URL("/api", baseUrl).toString(), options);
}

export type ApiClient = ReturnType<typeof createApiClient>;
export type { AppType };
