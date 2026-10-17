# User profile

> 🕒 Brief posted on Saturday 2026/10/17 14:50
>
> 🕒 Brief settled on Saturday 2026/10/17 14:59
>
> 🕒 Issues completed on Saturday 2026/10/17 15:20

## Updating the profile

On the account page, before the "Change password" block, add a form to update the first name, last name and nickname.

## Avatar

- A user has an avatar.
- Their avatar shows in the lineup.
- On their profile page, they can upload an avatar.
- When they don't have one, a default is used (boring-avatars).

## What to do

- Set up S3 storage: Garage locally, Scaleway Object Storage in production.
- Choose the image upload UI, following the "images" study ([009_images](../claude/009_images.md)).

## UI: profile page layout

1. First name / last name / nickname, with an "Update" button
2. Avatar
3. Change password

## Issues

- [#62 Profile Epic](https://github.com/TitoVince35/coverband/issues/62)
- [#58 Profile update form](https://github.com/TitoVince35/coverband/issues/58)
- [#59 S3 storage: Garage locally and in CI, Scaleway in production](https://github.com/TitoVince35/coverband/issues/59)
- [#60 Avatar upload, removal and serving](https://github.com/TitoVince35/coverband/issues/60)
- [#61 Avatars in the lineup and the user menu](https://github.com/TitoVince35/coverband/issues/61)
