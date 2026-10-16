/** Mailpit's web UI port, from docker-compose.yml. */
export const MAILPIT_PORT = 8025;

/**
 * Mailpit's web UI on the host serving the app, so the link works both on localhost
 * and from a phone on the local network. Mailpit only serves plain HTTP.
 */
export function mailpitUrl(hostname: string): string {
  return `http://${hostname}:${MAILPIT_PORT}`;
}
