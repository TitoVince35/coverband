import { isErrorCode } from "@coverband/shared";
import type { TFunction } from "i18next";

/** Error thrown by API calls; `code` is one of the shared API error codes, or "network". */
export class ApiRequestError extends Error {
  constructor(
    readonly code: string,
    message: string,
    /** The API's details about the error, if any (the song a duplicate matches). */
    readonly details: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/**
 * Throws an ApiRequestError for a non-2xx response, using the API's error code when present.
 * Returns the response narrowed to its success types (typed client responses carry `ok`).
 */
export async function ensureOk<R extends { ok: boolean; status: number; json(): Promise<unknown> }>(
  res: R,
): Promise<Exclude<R, { ok: false }>> {
  if (res.ok) {
    return res as Exclude<R, { ok: false }>;
  }
  const body = (await res.json().catch(() => null)) as {
    error?: { code?: unknown; details?: Record<string, string> };
  } | null;
  const code = isErrorCode(body?.error?.code) ? body.error.code : "internal_error";
  throw new ApiRequestError(code, `API returned ${res.status} (${code})`, body?.error?.details);
}

/** User-facing, translated message for any error raised while calling the API. */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiRequestError && isErrorCode(error.code)) {
    return t(`errors.${error.code}`);
  }
  if (error instanceof TypeError) {
    return t("errors.network"); // fetch failed: offline or server down
  }
  return t("errors.internal_error");
}
