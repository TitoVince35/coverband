import { type ApiErrorBody, type ErrorCode, errorCodeForStatus } from "@coverband/shared";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Sends a user-facing error with a stable code (translated by the web app). */
export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  message: string,
  code: ErrorCode = errorCodeForStatus(status),
) {
  return c.json<ApiErrorBody, typeof status>({ error: { code, message } }, status);
}
