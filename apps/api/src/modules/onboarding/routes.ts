import { acceptInvitationBody, bandNameQuery } from "@coverband/shared/schemas";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { isBandNameAvailable } from "../bands/service";
import { acceptInvitation, getInvitation } from "./service";

const tokenParam = z.object({ token: z.string().min(20).max(100) });

/**
 * Invitation links (/api/invitations/:token), public: the token is the proof. Band leaders create
 * their band here (#23), musicians join theirs (#7).
 */
export function onboardingRoutes(deps: AppDeps) {
  return new Hono<SessionEnv>()
    .get("/:token", zValidator("param", tokenParam, validationHook), async (c) => {
      return c.json(await getInvitation(deps, c.req.valid("param").token));
    })
    .get(
      "/:token/band-name",
      zValidator("param", tokenParam, validationHook),
      zValidator("query", bandNameQuery, validationHook),
      async (c) => {
        // Only someone holding a valid invitation can probe band names.
        await getInvitation(deps, c.req.valid("param").token);
        return c.json({ available: await isBandNameAvailable(deps.db, c.req.valid("query").name) });
      },
    )
    .post(
      "/:token/accept",
      zValidator("param", tokenParam, validationHook),
      zValidator("json", acceptInvitationBody, validationHook),
      async (c) => {
        const body = c.req.valid("json");
        const result = await acceptInvitation(deps, c.req.valid("param").token, body, c.var.user);
        const response = c.json({ bandSlug: result.bandSlug }, 201);
        // A new account is logged in straight away: forward Better Auth's session cookie.
        if (body.newAccount) {
          const login = await deps.auth.api.signInEmail({
            body: { email: result.email, password: body.newAccount.password },
            headers: c.req.raw.headers,
            asResponse: true,
          });
          for (const cookie of login.headers.getSetCookie()) {
            response.headers.append("set-cookie", cookie);
          }
        }
        return response;
      },
    );
}
