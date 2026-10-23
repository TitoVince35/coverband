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

/** The HTTP status of each error code: the only place where the domain's refusals meet HTTP. */
export const ERROR_STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  internal_error: 500,
  already_invited: 409,
  invitation_not_found: 404,
  invitation_expired: 410,
  invitation_revoked: 410,
  invitation_used: 410,
  invitation_wrong_account: 403,
  band_name_taken: 409,
  already_member: 409,
  too_many_requests: 429,
  invalid_image: 400,
  image_too_large: 413,
  song_duplicate: 409,
  song_in_use: 409,
  too_many_links: 409,
  lyrics_unavailable: 503,
  access_required: 403,
  access_code_invalid: 403,
  impersonation_read_only: 403,
  deezer_unavailable: 503,
  document_invalid: 400,
  document_too_large: 413,
  too_many_documents: 409,
  band_storage_full: 409,
};

/**
 * An expected refusal (a duplicate, an expired invitation...), thrown by the domain with a stable
 * code and sent by the app's error handler as `{ error: { code, message, details } }`, with the
 * status from ERROR_STATUS.
 */
export class AppError extends Error {
  /** An external service that failed (#208): logged as an error, never sent. */
  declare cause?: unknown;

  constructor(
    readonly code: ErrorCode,
    message: string,
    /** What the web app needs to explain the error (the song a duplicate matches). */
    readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Sends an AppError as the API's JSON error. */
export function appErrorResponse(c: Context, error: AppError) {
  return apiError(c, ERROR_STATUS[error.code], error.message, error.code, error.details);
}
