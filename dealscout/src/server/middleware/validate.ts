import type { RequestHandler } from "express";
import type { z } from "zod";

/** Validate (and normalize) req.body with a zod schema; failures go to the error handler as 400s. */
export function validateBody<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return next(parsed.error);
    req.body = parsed.data;
    next();
  };
}
