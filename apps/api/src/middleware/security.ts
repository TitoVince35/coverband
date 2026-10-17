import { secureHeaders } from "hono/secure-headers";

/**
 * CSP hash of the inline theme script in `apps/web/index.html`.
 * `security.test.ts` fails when the script changes and shows the new value.
 */
export const THEME_SCRIPT_HASH = "'sha256-ZM9GNmt7T0gMIeww6lU14YKqfvB7pQIX/adMqcZu4Gw='";

/**
 * Security headers on every response, API and web app.
 * HSTS only when the app is served over HTTPS (production): browsers would otherwise stick to
 * HTTPS on localhost.
 */
export function securityHeaders({ https }: { https: boolean }) {
  return secureHeaders({
    strictTransportSecurity: https ? "max-age=31536000; includeSubDomains" : false,
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
