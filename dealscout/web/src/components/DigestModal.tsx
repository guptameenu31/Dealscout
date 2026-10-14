import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Eye, Loader2, Send } from "lucide-react";
import { previewDigest, sendDigest } from "../api/client";
import { ApiClientError } from "../api/errors";
import type { WatchSpec } from "../api/types";
import { isEmail, useEmail } from "../lib/useEmail";
import { Dialog } from "./Dialog";
import { useToast } from "./Toast";

export function DigestModal({ open, onClose, spec }: { open: boolean; onClose: () => void; spec: WatchSpec }) {
  const [email, setEmail] = useEmail();
  const [touched, setTouched] = useState(false);
  const toast = useToast();

  const preview = useMutation({ mutationFn: () => previewDigest(spec) });
  const send = useMutation({
    mutationFn: () => sendDigest(spec, email.trim()),
    onSuccess: (r) => {
      toast(`Digest sent to ${r.to}`);
      onClose();
    },
  });

  useEffect(() => {
    if (!open) {
      preview.reset();
      send.reset();
      setTouched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = isEmail(email);
  const notReady = send.error instanceof ApiClientError && send.error.code === "NOT_IMPLEMENTED";
  const sendError = send.error && !notReady ? send.error.message : null;

  return (
    <Dialog open={open} onClose={onClose} title="Email me this digest">
      <div className="space-y-4 p-5">
        <div>
          <label htmlFor="digest-email" className="mb-1 block text-sm font-medium text-slate-700">
            Your email
          </label>
          <input
            id="digest-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !valid}
            aria-describedby="digest-email-err"
            placeholder="you@example.com"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <p id="digest-email-err" className="mt-1 min-h-5 text-xs text-rose-600">
            {touched && !valid ? "Enter a valid email address." : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => preview.mutate()} disabled={preview.isPending} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-medium ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            {preview.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />} Preview
          </button>
          <span title={notReady ? "Email sending coming soon" : undefined}>
            <button
              type="button"
              onClick={() => {
                setTouched(true);
                if (valid) send.mutate();
              }}
              disabled={send.isPending || notReady}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            >
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Send
            </button>
          </span>
        </div>

        {notReady && <p role="status" className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Email sending coming soon. You can still preview the digest.</p>}
        {sendError && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{sendError}</p>}
        {preview.error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{preview.error.message}</p>}

        {preview.data && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">
              Subject: <span className="text-slate-800">{preview.data.subject}</span>
            </p>
            <iframe title="Digest preview" sandbox="" srcDoc={preview.data.html} className="max-h-[70vh] h-96 w-full rounded-xl border border-slate-200 bg-white" />
          </div>
        )}
      </div>
    </Dialog>
  );
}
