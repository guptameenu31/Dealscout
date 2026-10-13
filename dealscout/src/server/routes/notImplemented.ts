import { Router } from "express";
import { notImplemented } from "../errors.ts";

/**
 * Endpoints that are part of the frozen API contract but not built yet.
 * They answer 501 NOT_IMPLEMENTED so the frontend can disable the feature gracefully.
 */
export function notImplementedRouter(): Router {
  const r = Router();
  r.post("/digest/send", () => {
    throw notImplemented("Email sending");
  });
  r.post("/watches", () => {
    throw notImplemented("Saved watches");
  });
  r.get("/watches", () => {
    throw notImplemented("Saved watches");
  });
  r.get("/watches/:id", () => {
    throw notImplemented("Saved watches");
  });
  r.post("/watches/:id/check", () => {
    throw notImplemented("Saved watches");
  });
  r.delete("/watches/:id", () => {
    throw notImplemented("Saved watches");
  });
  return r;
}
