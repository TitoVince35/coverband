import { FIELD_MAX_LENGTH } from "@coverband/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { removeAvatar, setAvatar } from "../avatars";
import type { AppDeps } from "../deps";
import { requireUser, type SessionEnv } from "../middleware/session";
import { updateProfile } from "../profile";
import { validationHook } from "../validation";

const text = (max: number) => z.string().trim().min(1).max(max);

const profileBody = z.object({
  firstName: text(FIELD_MAX_LENGTH.firstName),
  lastName: text(FIELD_MAX_LENGTH.lastName),
  nickname: z.string().trim().max(FIELD_MAX_LENGTH.nickname).optional(),
});

/**
 * The logged-in user's own account (/api/me). Better Auth keeps the profile fields read-only
 * (`input: false`), so they change here, and so does the avatar.
 */
export function meRoutes(deps: AppDeps) {
  return (
    new Hono<SessionEnv>()
      .use(requireUser)
      .patch("/", zValidator("json", profileBody, validationHook), async (c) => {
        const user = await updateProfile(deps.db, c.var.user.id, c.req.valid("json"));
        return c.json({ user });
      })
      // The browser sends the cropped image as the raw body (WebP, or JPEG from Safari), under the
      // 100 KB body limit.
      .put("/avatar", async (c) => {
        const bytes = new Uint8Array(await c.req.arrayBuffer());
        return c.json({ avatarUrl: await setAvatar(deps, c.var.user.id, bytes) });
      })
      .delete("/avatar", async (c) => {
        await removeAvatar(deps, c.var.user.id);
        return c.body(null, 204);
      })
  );
}
