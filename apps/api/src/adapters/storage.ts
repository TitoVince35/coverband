import { S3Client } from "bun";

/** A stored object, read back for streaming. */
export type StoredObject = { body: ReadableStream<Uint8Array>; type: string; size: number };

/**
 * Object storage for files (avatars, later sheet music). Private: files are only served through
 * API routes that check who may see them. Keys are paths like `users/{id}/avatar/{uuid}.webp`.
 */
export type Storage = {
  put(key: string, body: Blob | Uint8Array | string, type: string): Promise<void>;
  /** Null when there is no such object. */
  get(key: string): Promise<StoredObject | null>;
  /** Deleting a missing object is not an error. */
  delete(key: string): Promise<void>;
};

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

/** S3-compatible storage with Bun's built-in client: Garage locally, Scaleway in production. */
export function createS3Storage(config: S3Config): Storage {
  const s3 = new S3Client(config);
  return {
    async put(key, body, type) {
      await s3.write(key, body, { type });
    },
    async get(key) {
      const file = s3.file(key);
      try {
        const { size, type } = await file.stat();
        return { body: file.stream(), type, size };
      } catch (error) {
        if ((error as { code?: string }).code === "NoSuchKey") return null;
        throw error;
      }
    },
    async delete(key) {
      await s3.delete(key);
    },
  };
}

/** Keeps objects in memory, for tests. */
export function createMemoryStorage(): Storage & { objects: Map<string, Blob> } {
  const objects = new Map<string, Blob>();
  return {
    objects,
    async put(key, body, type) {
      // A copy: the caller may reuse its buffer.
      const part = body instanceof Uint8Array ? new Uint8Array(body) : body;
      objects.set(key, new Blob([part], { type }));
    },
    async get(key) {
      const blob = objects.get(key);
      return blob ? { body: blob.stream(), type: blob.type, size: blob.size } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}
