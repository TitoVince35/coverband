import type { Auth } from "./adapters/auth";
import type { LyricsProvider } from "./adapters/lyrics";
import type { Mailer } from "./adapters/mail/mailer";
import type { Storage } from "./adapters/storage";
import type { Db } from "./core/db/client";

/** Services the API routes use. Tests can pass a database that is never connected to. */
export type AppDeps = {
  auth: Auth;
  db: Db;
  mailer: Mailer;
  /** Object storage for files (avatars). */
  storage: Storage;
  /** Where song lyrics are searched online (LRCLIB). */
  lyrics: LyricsProvider;
  /** Public URL of the web app, for links in emails. */
  appUrl: string;
  /** Other origins the web app may be loaded from (`bun run dev:lan`). */
  trustedOrigins?: string[];
};
