import { Rocket } from "lucide-react";
import type { ValidatedItem } from "../api/types";
import { inr } from "../lib/format";

export function StretchBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
      <Rocket className="h-3.5 w-3.5" aria-hidden /> Stretch pick
    </span>
  );
}

/** "Within budget" or "₹X over budget" (amount computed by the server, never by the AI). */
export function BudgetBadge({ item }: { item: ValidatedItem }) {
  return item.withinBudget ? (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Within budget</span>
  ) : (
    <span className="tabular inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
      {inr(item.overBudgetBy ?? 0)} over budget
    </span>
  );
}
