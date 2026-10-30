/**
 * Stable codes for functional events, stored in the API's `activity` table. Like `ERROR_CODES`,
 * they never change once used: the future activity feed translates them.
 */
export const ACTIVITY_ACTIONS = [
  "invitation.sent",
  "invitation.resent",
  "invitation.revoked",
  "user.registered",
  "band.created",
  "member.joined",
  "band.genre_changed",
  "user.profile_updated",
  "user.avatar_changed",
  "member.instruments_changed",
  "song.added",
  "song.updated",
  "song.status_changed",
  "song.archived",
  "song.restored",
  "song.deleted",
  "song.lyrics_changed",
  "band.logo_changed",
  "user.impersonated",
  "contact.sent",
  "song.document_added",
  "song.document_removed",
  "band.disabled",
  "band.enabled",
  "band.deleted",
  "user.banned",
  "user.unbanned",
  "user.deleted",
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** What an activity is about (`target_type`). */
export const ACTIVITY_TARGETS = ["invitation", "user", "band", "song"] as const;

export type ActivityTarget = (typeof ACTIVITY_TARGETS)[number];
