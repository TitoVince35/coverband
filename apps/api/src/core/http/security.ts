import { bodyLimit } from "hono/body-limit";
import { csrf } from "hono/csrf";
import { createMiddleware } from "hono/factory";
import { secureHeaders } from "hono/secure-headers";
import { apiError } from "../errors";

/**
 * CSP hash of the inline theme script in `apps/web/index.html`.
 * `security.test.ts` fails when the script changes and shows the new value.
 */
export const THEME_SCRIPT_HASH = "'sha256-ZM9GNmt7T0gMIeww6lU14YKqfvB7pQIX/adMqcZu4Gw='";

/**
 * Whether browsers should be told to always use HTTPS for the app (HSTS): only for a real domain.
 * Local HTTPS (#163) is left out: HSTS on localhost would force HTTPS on every localhost port,
 * other projects included, for a year.
 */
export function wantsHsts(appUrl: string) {
  const { protocol, hostname } = new URL(appUrl);
  const local =
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
    hostname.startsWith("[");
  return protocol === "https:" && !local;
}

/** Security headers on every response, API and web app. HSTS as `wantsHsts` says. */
export function securityHeaders({ hsts }: { hsts: boolean }) {
  return secureHeaders({
    strictTransportSecurity: hsts ? "max-age=31536000; includeSubDomains" : false,
    // Invitation and password reset tokens are in URLs: never send them to other sites.
    referrerPolicy: "no-referrer",
    xFrameOptions: "DENY",
    permissionsPolicy: { camera: false, microphone: false, geolocation: false },
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", THEME_SCRIPT_HASH],
      // React style props and the toast library set inline styles.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
    },
  });
}

/**
 * Keeps search engines out (#149) while the app is private: no page or API answer is indexed.
 * With `robots.txt` (apps/web/public), which asks crawlers not to visit at all.
 */
export const noIndex = createMiddleware(async (c, next) => {
  await next();
  c.header("X-Robots-Tag", "noindex, nofollow");
});

/** Largest request body accepted on /api, but on the routes given a larger one. */
export const MAX_BODY_SIZE = 100 * 1024;

/** A route accepting a larger body than MAX_BODY_SIZE (a file upload). */
export type LargerBody = { method: string; path: RegExp; maxSize: number };

/**
 * Guards for /api: a body size limit, and CSRF protection refusing form-style requests
 * (form, multipart, text/plain) sent from other sites. JSON requests from other sites are already
 * blocked by the browser, since the API has no CORS.
 * `allowedOrigins`: the app URL and TRUSTED_ORIGINS (`bun run dev:lan`).
 * `largerBodies`: the upload routes, each with its own limit.
 */
export function requestGuards(allowedOrigins: string[], largerBodies: readonly LargerBody[] = []) {
  const origins = allowedOrigins.map((url) => new URL(url).origin);
  const limit = (maxSize: number) =>
    bodyLimit({ maxSize, onError: (c) => apiError(c, 413, "Request body too large") });
  const standard = limit(MAX_BODY_SIZE);
  const larger = largerBodies.map((route) => ({ ...route, guard: limit(route.maxSize) }));
  const sizeLimit = createMiddleware((c, next) => {
    const route = larger.find(
      ({ method, path }) => method === c.req.method && path.test(c.req.path),
    );
    return (route?.guard ?? standard)(c, next);
  });
  return [sizeLimit, csrf({ origin: origins })] as const;
}
