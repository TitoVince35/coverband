import { HttpError } from "ra-core";

/** The API's JSON error, `{ error: { code, message } }`, or Better Auth's, `{ code, message }`. */
type ApiErrorBody = { error?: { code?: string; message?: string }; message?: string };

/**
 * Calls the API on the admin app's own host (the same container, #246) and returns its JSON.
 * A refusal throws react-admin's `HttpError`, with the status and the API's English message.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const error = body as ApiErrorBody | null;
    const message = error?.error?.message ?? error?.message ?? res.statusText;
    throw new HttpError(message || `HTTP ${res.status}`, res.status, body);
  }
  return body as T;
}
