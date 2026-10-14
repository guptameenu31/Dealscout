import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Ban, Plus, X } from "lucide-react";

type Kind = "must" | "nice" | "excluded";

const CHIP: Record<Kind, string> = {
  must: "bg-indigo-600 text-white",
  nice: "bg-white text-indigo-700 ring-1 ring-inset ring-indigo-300",
  excluded: "bg-white text-rose-700 ring-1 ring-inset ring-rose-300",
};

interface Props {
  label: string;
  hint?: string;
  kind: Kind;
  values: string[];
  onChange: (next: string[]) => void;
}

/** Editable list of chips: click × to remove, type in the box and press Enter to add. */
export function ChipList({ label, hint, kind, values, onChange }: Props) {
  const [draft, setDraft] = useState("");
  const inputId = `chips-${kind}`;

  const add = () => {
    const v = draft.trim();
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && values.length) {
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white p-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200">
        {values.map((v) => (
          <span key={v} className={`inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-sm ${CHIP[kind]}`}>
            {kind === "excluded" && <Ban className="h-3.5 w-3.5" aria-hidden />}
            <span className={kind === "excluded" ? "line-through decoration-rose-400" : ""}>{v}</span>
            <button
              type="button"
              onClick={() => onChange(values.filter((x) => x !== v))}
              aria-label={`Remove ${v}`}
              className="rounded-full p-0.5 opacity-80 hover:bg-black/10 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={add}
          placeholder={values.length ? "Add another" : "Type and press Enter"}
          className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-slate-400"
        />
        {draft.trim() && (
          <button type="button" onClick={add} aria-label={`Add ${draft.trim()}`} className="rounded-full p-1 text-indigo-600 hover:bg-indigo-50">
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
