/**
 * Stable codes for user-facing API errors. The API returns
 * `{ error: { code, message } }`: `code` is translated by the web app,
 * `message` is an English fallback for developers and logs.
 * Adding a code requires a translation in every web locale (enforced by tests).
 */
export const ERROR_CODES = [
  "bad_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "internal_error",
  "already_invited",
  "invitation_not_found",
  "invitation_expired",
  "invitation_revoked",
  "invitation_used",
  "invitation_wrong_account",
  "band_name_taken",
  "already_member",
  "too_many_requests",
  "invalid_image",
  "image_too_large",
  "song_duplicate",
  "song_in_use",
  "too_many_links",
  "lyrics_unavailable",
  "access_required",
  "access_code_invalid",
  "impersonation_read_only",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiErrorBody = {
  /** `details`: what the web app needs to explain some errors (the song a duplicate matches). */
  error: { code: ErrorCode; message: string; details?: Record<string, string> };
};

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  429: "too_many_requests",
};

/** Default error code for an HTTP status, for errors raised without an explicit code. */
export function errorCodeForStatus(status: number): ErrorCode {
  return CODE_BY_STATUS[status] ?? (status < 500 ? "bad_request" : "internal_error");
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}
