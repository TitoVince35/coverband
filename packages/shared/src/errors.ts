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
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ApiErrorBody = {
  error: { code: ErrorCode; message: string };
};

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
};

/** Default error code for an HTTP status, for errors raised without an explicit code. */
export function errorCodeForStatus(status: number): ErrorCode {
  return CODE_BY_STATUS[status] ?? (status < 500 ? "bad_request" : "internal_error");
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}
