import { afterAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { activity } from "../db/schema";
import { createMemoryLogger } from "../log";
import { type ActivityEvent, recordActivity } from "./record";

// Integration tests: need the local Postgres with migrations applied. Skipped when DATABASE_URL is unset.
const databaseUrl = process.env.DATABASE_URL;

/** An event outside any band and by nobody, so it needs no other row. */
function eventFor(targetId: string): ActivityEvent {
  return {
    action: "contact.sent",
    bandId: null,
    actorId: null,
    target: { type: "user", id: targetId },
    data: { subject: "bug" },
  };
}

describe.skipIf(!databaseUrl)("recordActivity's log line (#320)", () => {
  const { log, entries } = createMemoryLogger();
  const { db, sql } = createDb(databaseUrl ?? "", { log });
  const targets: string[] = [];

  afterAll(async () => {
    for (const id of targets) await db.delete(activity).where(eq(activity.targetId, id));
    await sql.end();
  });

  const logged = (id: string) => entries.filter((e) => e.msg === "Activity" && e.targetId === id);

  test("an event recorded in a transaction is logged once it commits, with its fields", async () => {
    const id = crypto.randomUUID();
    targets.push(id);
    await db.transaction(async (tx) => {
      await recordActivity(tx, eventFor(id));
      // Still inside the transaction: nothing logged yet.
      expect(logged(id)).toHaveLength(0);
    });
    expect(logged(id)).toEqual([
      expect.objectContaining({
        level: "info",
        msg: "Activity",
        action: "contact.sent",
        bandId: null,
        actorId: null,
        targetType: "user",
        targetId: id,
        data: { subject: "bug" },
      }),
    ]);
  });

  test("a rolled-back change logs nothing", async () => {
    const id = crypto.randomUUID();
    targets.push(id);
    await expect(
      db.transaction(async (tx) => {
        await recordActivity(tx, eventFor(id));
        throw new Error("refused");
      }),
    ).rejects.toThrow("refused");
    expect(logged(id)).toHaveLength(0);
    expect(await db.select().from(activity).where(eq(activity.targetId, id))).toHaveLength(0);
  });

  test("an event recorded outside a transaction is logged right after its insert", async () => {
    const id = crypto.randomUUID();
    targets.push(id);
    await recordActivity(db, eventFor(id));
    expect(logged(id)).toHaveLength(1);
  });
});
