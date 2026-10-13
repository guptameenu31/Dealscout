import { Router } from "express";
import { z } from "zod";
import type { BuiltSpec } from "../../spec.ts";
import { validateBody } from "../middleware/validate.ts";

const SpecRequest = z.object({ request: z.string().trim().min(5).max(500) });

/** POST /api/spec { request } → { spec, via, warnings } */
export function specRouter(buildSpec: (query: string) => Promise<BuiltSpec>): Router {
  const r = Router();
  r.post("/spec", validateBody(SpecRequest), async (req, res) => {
    const { request } = req.body as z.infer<typeof SpecRequest>;
    const { spec, via, warnings } = await buildSpec(request);
    res.json({ spec, via, warnings });
  });
  return r;
}
