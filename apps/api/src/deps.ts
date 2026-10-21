import type { Auth } from "./adapters/auth";
import type { MusicCatalog } from "./adapters/deezer";
import type { LyricsProvider } from "./adapters/lyrics";
import type { Mailer } from "./adapters/mail/mailer";
import type { Storage } from "./adapters/storage";
import type { Db } from "./core/db/client";
import type { AccessConfig } from "./core/http/access";
import type { BuildInfo } from "./core/http/health";
import type { Logger } from "./core/log";

/** Services the API routes use. Tests can pass a database that is never connected to. */
export type AppDeps = {
  auth: Auth;
  db: Db;
  /** Technical logs; in a request, use its own logger (`c.var.log`), which carries its context. */
  log: Logger;
  mailer: Mailer;
  /** Object storage for files (avatars). */
  storage: Storage;
  /** Where song lyrics are searched online (LRCLIB). */
  lyrics: LyricsProvider;
  /** Where a new song's details are looked up (Deezer, #199). */
  catalog: MusicCatalog;
  /** Public URL of the web app, for links in emails. */
  appUrl: string;
  /** Other origins the web app may be loaded from (`bun run dev:lan`). */
  trustedOrigins?: string[];
  /** Version and build of the running release (`/api/health`). */
  buildInfo: BuildInfo;
  /** Other hostnames of the container, redirected to appUrl (the bare domain). */
  redirectHosts?: string[];
  /** Secret of the cron jobs' routes (/api/internal); absent: no such routes. */
  cronSecret?: string;
  /** The beta access code; absent: no gate. */
  access?: AccessConfig;
};
