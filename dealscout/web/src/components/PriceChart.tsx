import { CartesianGrid, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ScoredItem } from "../api/types";
import { inr, inrShort, shortDate } from "../lib/format";

interface Row {
  date: string;
  seeded: number | null;
  live: number | null;
  synthetic: boolean;
  today?: boolean;
}

/** Price history with the store's claimed "was" price drawn as a red line, so the gap is obvious. */
export function PriceChart({ item }: { item: ScoredItem }) {
  const { product: p, history, stats } = item;
  const todayIso = new Date().toISOString().slice(0, 10);

  const rows: Row[] = history.map((h, i) => {
    const prev = history[i - 1];
    // Repeat the last synthetic point on the first live row so the two lines join.
    const joins = h.provenance === "live" && prev?.provenance === "seeded";
    return {
      date: h.date,
      seeded: h.provenance === "seeded" || joins ? (joins ? prev.price : h.price) : null,
      live: h.provenance === "live" ? h.price : null,
      synthetic: h.provenance === "seeded",
    };
  });
  // Draw a segment from the last recorded point to today's price.
  const lastRow = rows[rows.length - 1];
  if (lastRow && lastRow.live === null) lastRow.live = history[history.length - 1].price;
  rows.push({ date: todayIso, seeded: null, live: p.currentPrice, synthetic: false, today: true });

  if (history.length < 2 || !stats) {
    return <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Not enough price history to draw a chart yet. DealScout will keep tracking this product.</p>;
  }

  const top = Math.max(stats.highest, p.claimedOriginal ?? 0, p.currentPrice);
  const bottom = Math.min(stats.lowest, p.currentPrice);
  const pad = (top - bottom) * 0.08;
  const domain: [number, number] = [Math.max(0, Math.floor((bottom - pad) / 500) * 500), Math.ceil((top + pad) / 500) * 500];
  const hasSeeded = stats.seededCount > 0;

  return (
    <div>
      <div className="h-72 w-full" role="img" aria-label={`Price history chart for ${p.name}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 11, fill: "#64748b" }} minTickGap={36} tickLine={false} axisLine={{ stroke: "#cbd5e1" }} />
            <YAxis domain={domain} tickFormatter={inrShort} tick={{ fontSize: 11, fill: "#64748b" }} width={46} tickLine={false} axisLine={false} />
            <Tooltip
              formatter={(value, _name, entry) => [inr(Number(value)), (entry?.payload as Row | undefined)?.synthetic ? "Price (synthetic)" : "Price"]}
              labelFormatter={(label) => shortDate(String(label))}
              contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
            />
            {p.claimedOriginal !== null && (
              <ReferenceLine
                y={p.claimedOriginal}
                stroke="#e11d48"
                strokeDasharray="6 4"
                strokeWidth={1.75}
                label={{ value: `Store's 'was' price ${inr(p.claimedOriginal)}`, position: "insideTopRight", fill: "#be123c", fontSize: 12, fontWeight: 600 }}
              />
            )}
            <ReferenceLine y={stats.median} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: `Typical ${inr(stats.median)}`, position: "insideBottomRight", fill: "#64748b", fontSize: 11 }} />
            <ReferenceLine y={stats.lowest} stroke="#0d9488" strokeDasharray="2 3" label={{ value: `Lowest ${inr(stats.lowest)}`, position: "insideTopLeft", fill: "#0f766e", fontSize: 11 }} />
            <Line dataKey="seeded" stroke="#818cf8" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} name="Synthetic demo history" />
            <Line dataKey="live" stroke="#4338ca" strokeWidth={2.25} dot={false} connectNulls isAnimationActive={false} name="Observed price" />
            <ReferenceDot x={todayIso} y={p.currentPrice} r={6} fill="#4338ca" stroke="#fff" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600" aria-label="Chart legend">
        {hasSeeded && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed border-indigo-400" aria-hidden /> Synthetic demo history
          </li>
        )}
        {stats.seededCount < stats.count && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-indigo-700" aria-hidden /> Observed price
          </li>
        )}
        {p.claimedOriginal !== null && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block w-5 border-t-2 border-dashed border-rose-500" aria-hidden /> Store's "was" price
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-700" aria-hidden /> Today
        </li>
      </ul>
    </div>
  );
}
