import { Router } from "express";

export function healthRouter(version: string): Router {
  const r = Router();
  r.get("/healthz", (_req, res) => {
    res.json({ ok: true, version });
  });
  return r;
}
