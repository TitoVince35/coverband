import { describe, expect, test } from "bun:test";
import { loadS3Env, s3Config } from "../env";
import { createMemoryStorage, createS3Storage, type Storage } from "./storage";

function behavesAsStorage(storage: Storage) {
  return async () => {
    const key = `test/${crypto.randomUUID()}.txt`;
    expect(await storage.get(key)).toBeNull();

    await storage.put(key, "hello", "text/plain");
    const object = await storage.get(key);
    expect(object?.type).toStartWith("text/plain");
    expect(object?.size).toBe(5);
    expect(await new Response(object?.body).text()).toBe("hello");

    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
    await storage.delete(key); // already gone: not an error
  };
}

test("memory storage", behavesAsStorage(createMemoryStorage()));

// Integration test: needs the local Garage (`bun run db:up`). Skipped when S3_ENDPOINT is unset.
describe.skipIf(!process.env.S3_ENDPOINT)("S3 storage", () => {
  test(
    "puts, streams and deletes objects",
    behavesAsStorage(createS3Storage(s3Config(loadS3Env()))),
  );
});
