import { Database, RefreshCw, Satellite, History } from "lucide-react";
import type { ScoutResponse } from "../api/types";
import { relativeTime } from "../lib/format";

interface Props {
  result: ScoutResponse;
  onTryLive?: () => void;
  retrying?: boolean;
}

/** Always shown above results: says where the product list came from. */
export function ProvenanceBanner({ result, onTryLive, retrying }: Props) {
  if (result.provenance === "live") {
    return (
      <div role="status" className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        <Satellite className="h-4 w-4 shrink-0" aria-hidden />
        <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        <span>
          <strong className="font-semibold">Live results</strong> · fetched {relativeTime(result.generatedAt)}
        </span>
      </div>
    );
  }
  if (result.provenance === "cached") {
    return (
      <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <History className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">
          Showing saved results from {result.cachedAt ? relativeTime(result.cachedAt) : "earlier"} · live search unavailable
          {result.fallbackReason ? ` (${result.fallbackReason})` : ""}
        </span>
        {onTryLive && (
          <button type="button" onClick={onTryLive} disabled={retrying} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-medium text-amber-800 ring-1 ring-amber-300 hover:bg-amber-100 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-amber-700">
            <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} aria-hidden /> Try live again
          </button>
        )}
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
      <Database className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">
        <strong className="font-semibold">Demo data</strong> · products and price history are synthetic, for demonstration
        {result.fallbackReason ? ` (${result.fallbackReason})` : ""}
      </span>
      {onTryLive && (
        <button type="button" onClick={onTryLive} disabled={retrying} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-medium text-violet-800 ring-1 ring-violet-300 hover:bg-violet-100 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-violet-700">
          <RefreshCw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} aria-hidden /> Try live
        </button>
      )}
    </div>
  );
}
