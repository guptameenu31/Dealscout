import { AlertTriangle, RotateCcw } from "lucide-react";

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <div className="flex-1">
          <p className="font-medium">Something went wrong</p>
          <p className="mt-0.5">{message}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 font-medium text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100 focus-visible:outline-2 focus-visible:outline-rose-600"
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Retry
          </button>
        )}
      </div>
    </div>
  );
}
