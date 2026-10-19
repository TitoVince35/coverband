// Postgres errors, as thrown by Drizzle (the driver's error is the `cause`).

type PgError = { code?: string; constraint_name?: string };

function pgError(error: unknown): PgError | undefined {
  return (error as { cause?: PgError } | null)?.cause;
}

/** A foreign key refused the change (a row still references the one being deleted). */
export function isForeignKeyViolation(error: unknown): boolean {
  return pgError(error)?.code === "23503";
}

/** A unique constraint or index refused the change; `constraint` narrows it to that one. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const cause = pgError(error);
  return (
    cause?.code === "23505" && (constraint === undefined || cause.constraint_name === constraint)
  );
}
