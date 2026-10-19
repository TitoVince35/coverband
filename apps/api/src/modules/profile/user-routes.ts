import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../../core/errors";
import { requireUser, type SessionEnv } from "../../core/http/session";
import { validationHook } from "../../core/http/validation";
import type { AppDeps } from "../../deps";
import { readAvatar } from "./avatars";

const idParam = z.object({ id: z.uuid() });

/** Other users' public bits (/api/users/:id), for people who share a band with them. */
export function userRoutes(deps: AppDeps) {
  return new Hono<SessionEnv>()
    .use(requireUser)
    .get("/:id/avatar", zValidator("param", idParam, validationHook), async (c) => {
      const avatar = await readAvatar(deps, c.var.user, c.req.valid("param").id);
      if (!avatar) return apiError(c, 404, "No avatar");
      // The URL changes with the file (?v=): a matching URL never goes stale.
      const { pathname, search } = new URL(c.req.url);
      const current = avatar.url === pathname + search;
      return c.body(avatar.body, 200, {
        "content-type": avatar.type,
        "content-length": String(avatar.size),
        "cache-control": current ? "private, max-age=31536000, immutable" : "private, no-cache",
      });
    });
}
