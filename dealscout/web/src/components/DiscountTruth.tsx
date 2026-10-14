import { AlertTriangle, BadgeCheck } from "lucide-react";
import type { Verdict } from "../api/types";
import { pct } from "../lib/format";

/** "Store says 33% off · Really 12% off": the line the whole product is built around. */
export function DiscountTruth({ verdict }: { verdict: Verdict }) {
  if (verdict.claimedDiscountPct <= 0) return null;
  if (verdict.fakeDiscount) {
    return (
      <div className="rounded-lg border border-rose-100 bg-rose-50/70 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Inflated discount
        </p>
        <p className="mt-0.5 text-sm text-slate-700">
          Store says <strong className="tabular font-bold text-slate-900">{pct(verdict.claimedDiscountPct)} off</strong> · Really{" "}
          <strong className="tabular font-bold text-rose-700">{pct(verdict.realDiscountPct)} off</strong>
        </p>
      </div>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-sm font-medium text-emerald-700">
      <BadgeCheck className="h-4 w-4" aria-hidden /> Genuine <strong className="tabular font-bold">{pct(verdict.claimedDiscountPct)} off</strong>
    </p>
  );
}
