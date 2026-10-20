// Technical logs on stdout, one line per entry: JSON in production (Scaleway Cockpit filters on
// its fields), a readable line in development. No dependency. Functional events go to the
// activity table, not here. Never log emails, names, tokens or passwords: IDs only.

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const LOG_FORMATS = ["json", "pretty"] as const;
export type LogFormat = (typeof LOG_FORMATS)[number];

export type LogFields = Record<string, unknown>;

export type Logger = {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** A logger adding these fields to every entry (a request's ID, its user...). */
  child(fields: LogFields): Logger;
};

export type LoggerOptions = {
  level: LogLevel;
  format: LogFormat;
  /** Where lines go (stdout by default); tests collect them. */
  write?: (line: string) => void;
  now?: () => Date;
};

const RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Errors become plain objects (JSON.stringify would give `{}`); bigints become strings. */
function serializable(_key: string, value: unknown) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause !== undefined && { cause: value.cause }),
    };
  }
  return typeof value === "bigint" ? value.toString() : value;
}

function json(entry: LogFields) {
  return JSON.stringify(entry, serializable);
}

function pretty({ time, level, msg, ...fields }: LogFields & { time: Date; level: LogLevel }) {
  const stacks: string[] = [];
  const pairs = Object.entries(fields).map(([key, value]) => {
    if (value instanceof Error) {
      stacks.push(value.stack ?? `${value.name}: ${value.message}`);
      return `${key}=${value.name}: ${value.message}`;
    }
    return `${key}=${typeof value === "string" ? value : JSON.stringify(value, serializable)}`;
  });
  const head = [time.toISOString().slice(11, 23), level.toUpperCase().padEnd(5), msg, ...pairs];
  return [head.join(" "), ...stacks].join("\n");
}

export function createLogger({
  level,
  format,
  write = (line) => process.stdout.write(`${line}\n`),
  now = () => new Date(),
}: LoggerOptions): Logger {
  const make = (context: LogFields): Logger => {
    const at =
      (entryLevel: LogLevel) =>
      (msg: string, fields: LogFields = {}) => {
        if (RANK[entryLevel] < RANK[level]) return;
        const entry = { time: now(), level: entryLevel, msg, ...context, ...fields };
        write(format === "json" ? json(entry) : pretty(entry));
      };
    return {
      debug: at("debug"),
      info: at("info"),
      warn: at("warn"),
      error: at("error"),
      child: (fields) => make({ ...context, ...fields }),
    };
  };
  return make({});
}

/** Logs nothing: tests and tools that don't want output. */
export const silentLogger: Logger = createLogger({
  level: "error",
  format: "json",
  write: () => {},
});

/** Tests: keeps every entry (all levels), as the JSON objects production would write. */
export function createMemoryLogger() {
  const entries: LogFields[] = [];
  const log = createLogger({
    level: "debug",
    format: "json",
    write: (line) => entries.push(JSON.parse(line)),
  });
  return { log, entries };
}
