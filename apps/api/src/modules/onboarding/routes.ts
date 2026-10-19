import { FIELD_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { isBandNameAvailable } from "../bands/service";
import { acceptInvitation, getInvitation } from "./service";

const text = (max: number) => z.string().trim().min(1).max(max);

const tokenParam = z.object({ token: z.string().min(20).max(100) });

const acceptBody = z.object({
  // Optional main instrument: a known code or free text (checked and tidied when stored).
  instrument: z
    .union([
      z.object({ code: z.string().max(50) }),
      z.object({ label: z.string().max(FIELD_MAX_LENGTH.instrument) }),
    ])
    .optional(),
  bandName: text(FIELD_MAX_LENGTH.bandName).optional(),
  genre: z.string().trim().max(FIELD_MAX_LENGTH.genre).optional(),
  newAccount: z
    .object({
      firstName: text(FIELD_MAX_LENGTH.firstName),
      lastName: text(FIELD_MAX_LENGTH.lastName),
      nickname: z.string().trim().max(FIELD_MAX_LENGTH.nickname).optional(),
      password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
    })
    .optional(),
});

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
      zValidator("query", z.object({ name: text(FIELD_MAX_LENGTH.bandName) }), validationHook),
      async (c) => {
        // Only someone holding a valid invitation can probe band names.
        await getInvitation(deps, c.req.valid("param").token);
        return c.json({ available: await isBandNameAvailable(deps.db, c.req.valid("query").name) });
      },
    )
    .post(
      "/:token/accept",
      zValidator("param", tokenParam, validationHook),
      zValidator("json", acceptBody, validationHook),
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
