import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Loader2 } from "lucide-react";
import { createWatch } from "../api/client";
import { ApiClientError } from "../api/errors";
import type { WatchSpec } from "../api/types";
import { isEmail, useEmail } from "../lib/useEmail";
import { Dialog } from "./Dialog";
import { useToast } from "./Toast";

export function WatchModal({ open, onClose, spec }: { open: boolean; onClose: () => void; spec: WatchSpec }) {
  const [email, setEmail] = useEmail();
  const [touched, setTouched] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: () => createWatch(spec, email.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["watches"] });
      toast("Watching this need. DealScout will check prices daily.", { label: "View your watches", href: "/watches" });
      onClose();
    },
  });

  useEffect(() => {
    if (!open) {
      create.reset();
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = isEmail(email);
  const notReady = create.error instanceof ApiClientError && create.error.code === "NOT_IMPLEMENTED";

  return (
    <Dialog open={open} onClose={onClose} title="Watch this need">
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (valid) create.mutate();
        }}
      >
        <p className="text-sm text-slate-600">
          DealScout will keep checking <strong>{spec.category}</strong> and email you when something worth buying shows up.
        </p>
        <div>
          <label htmlFor="watch-email" className="mb-1 block text-sm font-medium text-slate-700">
            Your email
          </label>
          <input
            id="watch-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !valid}
            aria-describedby="watch-email-err"
            placeholder="you@example.com"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <p id="watch-email-err" className="mt-1 min-h-5 text-xs text-rose-600">
            {touched && !valid ? "Enter a valid email address." : ""}
          </p>
        </div>
        {notReady && <p role="status" className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Watching a need is coming soon.</p>}
        {create.error && !notReady && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{create.error.message}</p>}
        <button type="submit" disabled={create.isPending || notReady} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />} Start watching
        </button>
      </form>
    </Dialog>
  );
}
