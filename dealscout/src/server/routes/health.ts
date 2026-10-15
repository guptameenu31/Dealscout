import { Router } from "express";

export function healthRouter(version: string): Router {
  const r = Router();
  // /api/health for the web app: Cloud Run's front end reserves /healthz and answers it with its own 404.
  r.get(["/healthz", "/api/health"], (_req, res) => {
    res.json({ ok: true, version });
  });
  return r;
}
