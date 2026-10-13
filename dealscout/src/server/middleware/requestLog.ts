import type { RequestHandler } from "express";

/** One line per request: method, path, status, duration. Never logs bodies (they contain emails). */
export const requestLog: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${ms.toFixed(0)}ms`);
  });
  next();
};
