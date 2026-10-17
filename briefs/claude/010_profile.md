# 010 - User profile and avatars: review and proposal

> 🕒 Study posted on Saturday 2026/10/17 14:50

Review of [009_profile](../vince/009_profile.md), following the images study [009_images](009_images.md).

## Review

1. **ugly-avatar isn't a library, and probably can't be used here.** It's a Vue demo site, not an npm package. Its faces are random on every draw, so they would have to be seeded from the user ID. Its README points to a non-commercial license (CC BY-NC 4.0), a risk if CoverBand ever charges. A library that is MIT, deterministic from a seed and runs in the browser fits better: DiceBear's JS package, `boring-avatars` or `minidenticons`.
2. **MinIO is no longer maintained.** It stopped publishing Docker images in October 2025, went into maintenance mode in December, and its repository was archived in February 2026. Maintained S3-compatible alternatives: Garage (made in France) and SeaweedFS. Our code only sees the `S3_*` variables.
3. **Avatars go through the API, not straight to the bucket** (a revision of [009_images](009_images.md) for avatars). Resized in the browser to 512 px WebP, an avatar weighs about 30–60 KB, under the 100 KB body limit. The API checks the size and real format and writes the file with Bun's built-in S3 client: no new dependency, no bucket CORS, no CSP change. Bun's presigning only does PUT, which can't enforce a size limit. Direct presigned uploads stay the plan for sheet music, whose files are larger.
4. **Who sees an avatar:** the user, the people who share a band with them, and admins. A route like `GET /api/users/:id/avatar` checks that, then streams the image from a private bucket. Same origin, so no CSP change; the URL carries a version (`?v=`) so browsers cache it for a long time.
5. **Gaps in the brief:**
   - **Removing the avatar** brings back the default.
   - **The user menu** in the header shows the avatar too, not only the lineup.
   - **Cropping:** an automatic centered square crop with a preview, no crop editor for now. On phones, the file picker offers the camera.
   - **The display name follows the profile:** `name` is computed from nickname, first and last name, so the server recomputes it; clearing the nickname brings back "First Last". Better Auth declares these fields `input: false`, so the update goes through our own route, which also enforces `FIELD_MAX_LENGTH`.
   - **Email change** is out of scope: it needs a verification flow.
   - **Activity (#43):** both are writes, so they record `user.profile_updated` and `user.avatar_changed`, IDs only.
   - **Deployment:** the Scaleway bucket and its keys become a production setup step (#8). CI gets an S3 service, like Postgres.

## Decisions (Vince)

- Default avatars: **`boring-avatars`** (ugly-avatar was a mistake), seeded by the user ID.
- Local and CI storage: **Garage**.
- Upload through the API and serving rules (points 3 and 4): accepted.
- Every gap in point 5: yes.

## Plan

An epic with four issues, in this order:

1. **Profile update form:** API route recomputing the display name, account page form, activity, i18n, tests.
2. **S3 storage:** Garage in `docker compose` and CI, `S3_*` environment variables, a small storage module on Bun's S3 client.
3. **Avatar upload, removal and serving:** API routes, visibility check, account page card with crop and preview, activity, tests.
4. **Avatars in the lineup and the user menu,** with the `boring-avatars` default.
