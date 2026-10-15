import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError, z } from "zod";
import { AppError } from "../errors.ts";

/** Unknown /api/* routes. */
export const apiNotFound: RequestHandler = (req, _res, next) =>
  next(new AppError(404, "NOT_FOUND", `No API route for ${req.method} ${req.path}`));

/** Every error leaves as { error: { code, message, details? } }. Internals and stack traces are never sent. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    // Server-side failures (Gemini/Serper errors, timeouts) are only otherwise visible to the client.
    if (err.status >= 500) console.error(`${req.method} ${req.originalUrl.split("?")[0]} ${err.status} ${err.code}: ${err.message}`);
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: z.prettifyError(err),
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }
  // Errors raised by express.json() (body-parser) carry a `type`.
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request body is not valid JSON." } });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "VALIDATION_ERROR", message: "Request body is too large." } });
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong. Please try again." } });
};
