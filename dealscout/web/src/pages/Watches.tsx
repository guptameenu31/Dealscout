import { BellRing, CalendarClock, Mail, Pause, RefreshCw, Save, TrendingDown } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeading } from "../components/PageHeading";

/**
 * Watches are planned for v1.2 (Firestore + Cloud Scheduler + email). Until then this page previews the feature with a
 * clearly labelled sample, and makes no API calls.
 */

const STEPS = [
  {
    icon: Save,
    title: "Save a need",
    body: "From your search results, watch the need (not one product) with your email address.",
  },
  {
    icon: CalendarClock,
    title: "Scheduled price checks",
    body: "DealScout re-checks live Google Shopping prices for your shortlisted models every day and stores each price it sees, building a real price history.",
  },
  {
    icon: Mail,
    title: "Email when it's time to buy",
    body: "You get an email when a pick drops to its lowest since you started watching, or comes within your budget.",
  },
];

const SAMPLE_ROWS = [
  { name: "Sony WF-C700N", price: "₹7,990", note: "Lowest since you started watching", drop: "↓ ₹800 in 9 days" },
  { name: "OnePlus Buds 3", price: "₹4,249", note: "Steady for 2 weeks", drop: null },
  { name: "OnePlus Buds Pro 3", price: "₹10,299", note: "₹299 over budget", drop: "↓ ₹700 in 9 days" },
];

function SampleWatch() {
  return (
    <div className="relative rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_6px_24px_rgba(80,70,160,0.06)]" aria-label="Sample watch (preview, not real data)">
      <span className="absolute -top-3 right-4 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">Preview · sample data</span>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Truly wireless earbuds</h3>
          <p className="tabular text-sm text-slate-500">Up to ₹10,000 · you@example.com</p>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-slate-500">
          <CalendarClock className="h-4 w-4" aria-hidden /> Checked daily · last check 2 hours ago
        </p>
      </div>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {["active noise cancellation", "true wireless"].map((m) => (
          <li key={m} className="rounded-full bg-indigo-600 px-2.5 py-1 text-xs text-white">
            {m}
          </li>
        ))}
      </ul>
      <ul className="mt-4 divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200">
        {SAMPLE_ROWS.map((r) => (
          <li key={r.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3.5 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <span className="font-medium">{r.name}</span>
              <span className="block text-xs text-slate-500">{r.note}</span>
            </span>
            {r.drop && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <TrendingDown className="h-3.5 w-3.5" aria-hidden /> {r.drop}
              </span>
            )}
            <span className="tabular font-semibold">{r.price}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl bg-slate-50 p-3.5 text-sm">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
          <Mail className="h-3.5 w-3.5" aria-hidden /> Email you'd receive
        </p>
        <p className="mt-1.5 font-medium text-slate-800">DealScout: Sony WF-C700N is at its lowest price since you started watching</p>
        <p className="text-slate-500">₹7,990 at Myntra (was ₹8,790 when you started watching). 2 other picks are still within your budget.</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white opacity-50">
          <RefreshCw className="h-4 w-4" aria-hidden /> Check now
        </button>
        <button type="button" disabled className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-inset ring-slate-300 opacity-50">
          <Pause className="h-4 w-4" aria-hidden /> Pause
        </button>
      </div>
    </div>
  );
}

export default function Watches() {
  return (
    <div className="space-y-8">
      <PageHeading
        eyebrow="Coming in v1.2"
        title="My watches"
        subtitle="Save a need once. DealScout keeps checking prices for you and emails you when it's time to buy."
      />

      <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
        <BellRing className="h-4 w-4 shrink-0" aria-hidden />
        <span className="flex-1">Watches aren't available yet. Below is a preview of how they'll work.</span>
        <Link to="/" className="font-semibold text-indigo-700 hover:text-indigo-800 focus-visible:outline-2 focus-visible:outline-indigo-600">
          Start a search
        </Link>
      </div>

      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="rounded-2xl border border-slate-200 bg-white p-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100 text-indigo-600" aria-hidden>
              <s.icon className="h-5 w-5" />
            </span>
            <h2 className="mt-3 font-semibold">
              <span className="text-slate-400">0{i + 1} </span>
              {s.title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">{s.body}</p>
          </li>
        ))}
      </ol>

      <SampleWatch />
    </div>
  );
}
