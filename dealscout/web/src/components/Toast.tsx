import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Link } from "react-router-dom";

interface ToastItem {
  id: number;
  text: string;
  action?: { label: string; href: string };
}

const ToastContext = createContext<(text: string, action?: ToastItem["action"]) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const dismiss = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));
  const push = useCallback((text: string, action?: ToastItem["action"]) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, action }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 6000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => (
          <div key={t.id} className="rise pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
            <span>{t.text}</span>
            {t.action && (
              <Link to={t.action.href} onClick={() => dismiss(t.id)} className="font-medium text-indigo-300 underline underline-offset-2 hover:text-indigo-200">
                {t.action.label}
              </Link>
            )}
            <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="rounded p-0.5 text-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
