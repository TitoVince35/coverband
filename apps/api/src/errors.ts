import { type ApiErrorBody, type ErrorCode, errorCodeForStatus } from "@coverband/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Sends a user-facing error with a stable code (translated by the web app). */
// The status stays a literal type, so the typed client knows these responses are errors.
export function apiError<S extends ContentfulStatusCode>(
  c: Context,
  status: S,
  message: string,
  code: ErrorCode = errorCodeForStatus(status),
  details?: Record<string, string>,
) {
  return c.json<ApiErrorBody, S>({ error: { code, message, ...(details && { details }) } }, status);
}
