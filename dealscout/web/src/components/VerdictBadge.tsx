import { Ban, CheckCircle2, PauseCircle } from "lucide-react";
import type { Confidence, VerdictLabel } from "../api/types";

const STYLES: Record<VerdictLabel, { text: string; cls: string; Icon: typeof CheckCircle2 }> = {
  buy_now: { text: "Buy now", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
  wait: { text: "Wait", cls: "bg-amber-50 text-amber-700 ring-amber-200", Icon: PauseCircle },
  skip: { text: "Over budget", cls: "bg-slate-100 text-slate-600 ring-slate-200", Icon: Ban },
};

export function VerdictBadge({ label }: { label: VerdictLabel }) {
  const { text, cls, Icon } = STYLES[label];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {text}
    </span>
  );
}

const CONF: Record<Confidence, { text: string; dots: number }> = {
  high: { text: "High confidence", dots: 3 },
  medium: { text: "Medium confidence", dots: 2 },
  low: { text: "Low confidence", dots: 1 },
};

export function ConfidenceMeter({ level }: { level: Confidence }) {
  const { text, dots } = CONF[level];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((n) => (
          <span key={n} className={`h-1.5 w-1.5 rounded-full ${n <= dots ? "bg-slate-500" : "bg-slate-200"}`} />
        ))}
      </span>
      {text}
    </span>
  );
}
