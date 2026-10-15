/** Only same-app paths are allowed after login, never another site (open redirect). */
export function safeRedirect(value: unknown): string | undefined {
  // "//host" and "/\host" are both read by browsers as another site.
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : undefined;
}
