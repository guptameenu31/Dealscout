import { Router } from "express";
import { z } from "zod";
import { renderHtml } from "../../digest.ts";
import { WatchSpecSchema } from "../../watchSpec.ts";
import type { ScoutResponse } from "../apiTypes.ts";
import { validateBody } from "../middleware/validate.ts";
import { runScout, toScoredProducts, type ScoutDeps } from "../scoutService.ts";

export const ScoutRequest = z.object({
  spec: WatchSpecSchema,
  mode: z.enum(["auto", "live", "seeded"]).default("auto"),
});
type ScoutBody = z.infer<typeof ScoutRequest>;

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function digestNote(res: ScoutResponse): string | undefined {
  if (res.provenance === "seeded") return "Demo data: these products and their price histories are synthetic, for demonstration only.";
  if (res.provenance === "cached") return `Saved results from ${res.cachedAt?.slice(0, 10)}; live search was unavailable.`;
  return undefined;
}

/** POST /api/scout and POST /api/digest/preview */
export function scoutRouter(deps: ScoutDeps): Router {
  const r = Router();

  r.post("/scout", validateBody(ScoutRequest), async (req, res) => {
    const { spec, mode } = req.body as ScoutBody;
    res.json(await runScout(spec, mode, deps));
  });

  r.post("/digest/preview", validateBody(ScoutRequest), async (req, res) => {
    const { spec, mode } = req.body as ScoutBody;
    const result = await runScout(spec, mode, deps);
    const buy = result.items.filter((i) => i.verdict.label === "buy_now").length;
    const wait = result.items.filter((i) => i.verdict.label === "wait").length;
    res.json({
      subject: `DealScout: ${buy} to buy now, ${wait} to watch (${spec.category} under ${inr(spec.budget)})`,
      html: renderHtml(spec, toScoredProducts(result), digestNote(result)),
    });
  });

  return r;
}
