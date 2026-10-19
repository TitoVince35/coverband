import type { Context } from "hono";
import { apiError } from "../errors";

type ValidationResult =
  | { success: true }
  | { success: false; error: { issues: readonly { message: string }[] } };

/** zValidator hook: invalid input becomes our standard 400 `bad_request` error. */
export function validationHook(result: ValidationResult, c: Context) {
  if (!result.success) {
    return apiError(c, 400, result.error.issues.map((issue) => issue.message).join("; "));
  }
}
