import type { RequestHandler } from "express";
import { AppError } from "../errors.ts";

/**
 * Tiny fixed-window limiter per client IP. Live search costs money, so a public demo URL
 * must not be callable in a tight loop. In-memory: resets on restart, per instance (fine for a prototype).
 */
export function rateLimit(perMinute: number): RequestHandler {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return (req, _res, next) => {
    if (perMinute === 0 || req.method !== "POST") return next();
    const now = Date.now();
    const ip = req.ip ?? "unknown";
    let w = windows.get(ip);
    if (!w || now >= w.resetAt) {
      w = { count: 0, resetAt: now + 60_000 };
      windows.set(ip, w);
    }
    if (++w.count > perMinute) {
      return next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again in a minute."));
    }
    if (windows.size > 10_000) windows.clear(); // crude memory bound
    next();
  };
}
