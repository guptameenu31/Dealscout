import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  variant?: "modal" | "drawer";
  children: ReactNode;
}

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,select,iframe,[tabindex]:not([tabindex="-1"])';

/** Modal or right-side drawer: traps focus, closes on Esc and backdrop click, restores focus on close. */
export function Dialog({ open, onClose, title, variant = "modal", children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const nodes = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!nodes.length) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === firstNode) {
        e.preventDefault();
        lastNode.focus();
      } else if (!e.shiftKey && document.activeElement === lastNode) {
        e.preventDefault();
        firstNode.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  const isDrawer = variant === "drawer";
  return (
    <div className="fixed inset-0 z-50 flex" role="presentation">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={
          isDrawer
            ? "rise relative ml-auto flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:max-w-xl"
            : "rise relative m-auto flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl max-sm:m-0 max-sm:h-full max-sm:max-h-none max-sm:rounded-none"
        }
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
