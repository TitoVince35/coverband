/** Mailpit's web UI port, from docker-compose.yml. */
export const MAILPIT_PORT = 8025;

/**
 * Mailpit's web UI on the host serving the app, so the link works both on localhost
 * and from a phone on the local network. Mailpit only serves plain HTTP.
 */
export function mailpitUrl(hostname: string): string {
  return `http://${hostname}:${MAILPIT_PORT}`;
}

/** Garage's web UI port (garage-webui service in docker-compose.yml). */
export const GARAGE_UI_PORT = 3909;

/** Garage's web UI (object storage) on the host serving the app, like Mailpit. */
export function garageUrl(hostname: string): string {
  return `http://${hostname}:${GARAGE_UI_PORT}`;
}

/**
 * Drizzle Studio (started by `bun run dev`), or null away from the dev machine. Its UI is hosted by
 * Drizzle and talks to the local studio server on 127.0.0.1, so it only works on that machine.
 */
export function drizzleStudioUrl(hostname: string): string | null {
  return hostname === "localhost" || hostname === "127.0.0.1"
    ? "https://local.drizzle.studio"
    : null;
}
