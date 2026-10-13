export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR"
  | "NOT_IMPLEMENTED"
  | "INTERNAL";

/** An error that is safe to show to API clients. Anything else becomes a generic 500. */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notImplemented = (feature: string) =>
  new AppError(501, "NOT_IMPLEMENTED", `${feature} is not available yet.`);
