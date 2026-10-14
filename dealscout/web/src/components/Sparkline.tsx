import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import type { PricePoint } from "../api/types";

export function Sparkline({ history, current }: { history: PricePoint[]; current: number }) {
  const gradId = useId().replace(/:/g, "");
  if (history.length < 2) {
    return <div className="flex h-14 items-center text-xs text-slate-400">Not enough history to chart yet</div>;
  }
  const data = [...history.map((h) => ({ p: h.price })), { p: current }];
  // A fixed band around the average keeps ordinary +/-3% noise from looking like a crash.
  const mean = data.reduce((a, d) => a + d.p, 0) / data.length;
  const lo = Math.min(mean * 0.9, ...data.map((d) => d.p));
  const hi = Math.max(mean * 1.08, ...data.map((d) => d.p));
  return (
    <div className="h-14" role="img" aria-label={`Price trend over ${history.length} days`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6365d8" stopOpacity={0.22} />
              <stop offset="1" stopColor="#6365d8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={[lo, hi]} />
          <Area type="monotone" dataKey="p" stroke="#6365d8" strokeWidth={1.75} fill={`url(#${gradId})`} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
