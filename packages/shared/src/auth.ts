/** Password policy, enforced by the API (Better Auth) and checked in the web forms. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Global role of a user, for the whole application. Band roles (leader, musician)
 * are per membership and live with the bands.
 */
export const ADMIN_ROLE = "admin";
