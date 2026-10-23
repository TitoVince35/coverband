import { contactBody } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { apiError } from "../../core/errors";
import { type RateLimitRule, rateLimitUser } from "../../core/http/rate-limit";
import { requireUser, type SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { sendContactMessage } from "./service";

/** Messages to the app's team per user and day (#234). */
export const CONTACT_EMAILS: RateLimitRule = {
  name: "contact-emails",
  max: 5,
  windowMs: 24 * 60 * 60 * 1000,
};

/** The contact form (/api/contact, logged-in users): whether it's offered, and sending. */
export function contactRoutes(deps: AppDeps) {
  const recipient = deps.contactRecipient;
  return (
    new Hono<SessionEnv>()
      .use(requireUser)
      // Without a recipient (CONTACT_FORM_RECIPIENT unset), the web app doesn't offer it.
      .get("/", (c) => c.json({ available: recipient !== undefined }))
      .post(
        "/",
        zValidator("json", contactBody, validationHook),
        rateLimitUser(deps.db, CONTACT_EMAILS),
        async (c) => {
          if (!recipient) return apiError(c, 404, "No contact form");
          const { id, name, email } = c.var.user;
          await sendContactMessage(
            deps,
            recipient,
            { id, name, email },
            c.req.valid("json"),
            c.req.header("user-agent") ?? null,
          );
          return c.body(null, 204);
        },
      )
  );
}
