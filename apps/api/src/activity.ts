import type { ActivityAction, ActivityTarget } from "@coverband/shared";
import type { Db, Tx } from "./db/client";
import { activity } from "./db/schema";

export type ActivityEvent = {
  action: ActivityAction;
  /** Null for events outside a band. */
  bandId: string | null;
  /** The user who acted; null when nobody is logged in. */
  actorId: string | null;
  target: { type: ActivityTarget; id: string };
  /** Small, non-personal details: IDs, roles, codes. Never emails or names. */
  data?: Record<string, string | number | boolean | null>;
};

/**
 * Records a functional event. Pass the transaction of the change itself, so there is no event
 * without its change and no change without its event.
 */
export async function recordActivity(tx: Db | Tx, event: ActivityEvent) {
  await tx.insert(activity).values({
    action: event.action,
    bandId: event.bandId,
    actorId: event.actorId,
    targetType: event.target.type,
    targetId: event.target.id,
    data: event.data ?? null,
  });
}
