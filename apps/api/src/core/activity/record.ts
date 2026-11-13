import type { ActivityAction, ActivityTarget } from "@coverband/shared";
import { afterCommit, type Db, dbLog, type Tx } from "../db/client";
import { activity } from "../db/schema";

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
 *
 * Once the change is committed, the event is also logged (#320, study 026): Cockpit's Grafana
 * counts events from the logs, without querying the database. A rolled-back change logs nothing.
 */
export async function recordActivity(tx: Db | Tx, event: ActivityEvent) {
  const data = event.data ?? null;
  await tx.insert(activity).values({
    action: event.action,
    bandId: event.bandId,
    actorId: event.actorId,
    targetType: event.target.type,
    targetId: event.target.id,
    data,
  });
  afterCommit(tx, () =>
    dbLog(tx).info("Activity", {
      action: event.action,
      bandId: event.bandId,
      actorId: event.actorId,
      targetType: event.target.type,
      targetId: event.target.id,
      data,
    }),
  );
}
