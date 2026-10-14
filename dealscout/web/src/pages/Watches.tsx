import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, ChevronLeft, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { checkWatch, deleteWatch, listWatches } from "../api/client";
import { ApiClientError } from "../api/errors";
import type { Watch } from "../api/types";
import { ErrorState } from "../components/ErrorState";
import { PageHeading } from "../components/PageHeading";
import { Results } from "../components/Results";
import { useToast } from "../components/Toast";
import { inr, relativeTime } from "../lib/format";

function Empty() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <Bell className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
      <p className="mt-3 font-medium">No watches yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Describe a need and tap "Watch this need". DealScout will check prices daily and email you.
      </p>
      <Link to="/" className="mt-4 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
        Start a search
      </Link>
    </div>
  );
}

function summary(w: Watch): string {
  const r = w.lastResult;
  if (!r) return "Not checked yet";
  const buy = r.items.filter((i) => i.verdict.label === "buy_now").length;
  const inflated = r.items.filter((i) => i.verdict.fakeDiscount).length;
  return `${buy} Buy now · ${inflated} inflated discount${inflated === 1 ? "" : "s"}`;
}

function WatchCard({ watch, onView }: { watch: Watch; onView: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const check = useMutation({
    mutationFn: () => checkWatch(watch.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watches"] });
      toast("Checked just now");
    },
  });
  const del = useMutation({
    mutationFn: () => deleteWatch(watch.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["watches"] }),
  });
  const { spec } = watch;

  return (
    <li className="space-y-3 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_6px_24px_rgba(80,70,160,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold capitalize">{spec.category}</h3>
          <p className="tabular text-sm text-slate-500">Up to {inr(spec.budget)} · {watch.email}</p>
        </div>
        <p className="text-sm text-slate-500">Last checked {watch.lastCheckedAt ? relativeTime(watch.lastCheckedAt) : "never"}</p>
      </div>
      {spec.mustHaves.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {spec.mustHaves.map((m) => (
            <li key={m} className="rounded-full bg-indigo-600 px-2.5 py-1 text-xs text-white">
              {m}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm font-medium text-slate-700">{summary(watch)}</p>
      {(check.error || del.error) && <p role="alert" className="text-sm text-rose-700">{(check.error ?? del.error)!.message}</p>}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" onClick={() => check.mutate()} disabled={check.isPending} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          {check.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />} Check now
        </button>
        <button type="button" onClick={onView} disabled={!watch.lastResult} className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          View results
        </button>
        {confirming ? (
          <span className="ml-auto flex items-center gap-2 text-sm">
            Are you sure?
            <button type="button" onClick={() => del.mutate()} disabled={del.isPending} className="rounded-lg bg-rose-600 px-3 py-1.5 font-medium text-white hover:bg-rose-700 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600">
              {del.isPending ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="rounded-lg px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100">
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600">
            <Trash2 className="h-4 w-4" aria-hidden /> Delete
          </button>
        )}
      </div>
    </li>
  );
}

export default function Watches() {
  const q = useQuery({ queryKey: ["watches"], queryFn: listWatches, retry: false });
  const [viewing, setViewing] = useState<Watch | null>(null);

  if (viewing?.lastResult) {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setViewing(null)} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          <ChevronLeft className="h-4 w-4" aria-hidden /> All watches
        </button>
        <PageHeading eyebrow="Saved watch" title={viewing.spec.category} />
        <Results result={viewing.lastResult} hideActions />
      </div>
    );
  }

  const notReady = q.error instanceof ApiClientError && q.error.code === "NOT_IMPLEMENTED";

  return (
    <div className="space-y-6">
      <PageHeading eyebrow="Your price radar" title="My watches" subtitle="Your needs, keeping an eye on the right deal." />
      {q.isPending && <div className="h-32 animate-pulse rounded-2xl bg-white ring-1 ring-slate-200" aria-label="Loading watches" />}
      {q.isError && !notReady && <ErrorState message={q.error.message} onRetry={() => q.refetch()} />}
      {(notReady || (q.isSuccess && q.data.watches.length === 0)) && <Empty />}
      {q.isSuccess && q.data.watches.length > 0 && (
        <ul className="grid gap-4 lg:grid-cols-2">
          {q.data.watches.map((w) => (
            <WatchCard key={w.id} watch={w} onView={() => setViewing(w)} />
          ))}
        </ul>
      )}
    </div>
  );
}
