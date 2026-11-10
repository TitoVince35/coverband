# 009 - Images: avatar services or our own storage

> 🕒 Study posted on Saturday 2026/10/17 14:16

Answer to: "I want to add images to the entities (bands, musicians and more). Can we use a free online avatar service, or is it best to use our own storage from day one?"

## Recommendation

**Use our own storage from day one**, with locally generated placeholder avatars when there's no image. Skip third-party avatar services.

## Why not a free avatar service

- **Gravatar**, the main free option, only covers people. It does nothing for bands, gigs or songs. It also sends each user's email hash to a US company, and the CSP ([008_security](008_security.md)) would have to allow its domain. That cuts against the choice to host everything in Paris.
- **Image services with free tiers** (Cloudinary, ImageKit, Uploadcare) would hold private band data under a third party's terms. Free tiers change, and moving out later means migrating every file.
- **We need object storage anyway.** [001_initial-proposal](001_initial-proposal.md) already puts sheet music on Scaleway Object Storage with presigned uploads, and [008_security](008_security.md) capped request bodies at 100 KB because "files will go straight to Object Storage later". Images are the simplest first use of that pipeline, and sheet music can reuse it.
- **Cost is close to zero.** At €0.016/GB/month ([007_scaleway-products](007_scaleway-products.md)), a few thousand 50 KB avatars is a rounding error.

## Entities without an image

Show initials or a generated pattern, drawn in the browser by a small library (e.g. `boring-avatars`, or DiceBear's JS package rather than its HTTP API). It's free, needs no network call and works offline in the PWA.

## What "our own storage" involves

None of it is hard, but each point needs a decision:

1. **Resize in the browser before upload.** Shrink to about 512 px WebP with a canvas, so the server never processes images and stays stateless.
2. **Upload straight to the bucket.** The API checks band membership and role, then returns a **presigned POST**, not a PUT, because a POST policy can enforce a size limit and content type. The file never passes through the API.
3. **Serving:**
   - **Private bucket with short-lived presigned GET URLs.** This fits the multi-tenancy rule, but caching needs care: keep signatures stable over a time window.
   - **Public-read bucket with unguessable keys.** Simpler, and probably fine for avatars, but it's a weaker model than what sheet music will need.

   Lean private, so both kinds of files follow one rule.
4. **Storage keys, not URLs, in the database.** Use band-scoped keys like `bands/{bandId}/avatar/{uuid}.webp`. A new key on each change makes caching trivial. Better Auth's `user.image` column already exists and can hold the key.
5. **Cleanup.** Delete the old object when an image is replaced, a band is deleted or an account is deleted.
6. **Local dev.** Add an S3-compatible container (MinIO) to `docker compose`, next to Postgres and Mailpit. Add the bucket's domain to the CSP `img-src`.
