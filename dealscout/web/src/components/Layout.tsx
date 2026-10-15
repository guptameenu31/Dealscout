import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Plus, Radar } from "lucide-react";
import { health } from "../api/client";

const link = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-1.5 rounded-xl px-2.5 py-2.5 text-sm font-semibold sm:gap-2 sm:px-4 sm:text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
    isActive ? "bg-indigo-100 text-indigo-700" : "text-slate-600 hover:bg-slate-100"
  }`;

export function Layout() {
  const api = useQuery({ queryKey: ["health"], queryFn: health, refetchInterval: 60_000, retry: false });
  const state = api.isSuccess && api.data.ok ? "online" : api.isError ? "offline" : "checking";
  const dot = { online: "bg-emerald-600", offline: "bg-rose-600", checking: "bg-slate-300" }[state];

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <nav className="mx-auto flex h-[72px] max-w-6xl items-center gap-3 px-4 sm:px-8" aria-label="Main">
          <NavLink to="/" className="flex items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600" aria-label="DealScout home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-[0_4px_10px_rgba(99,101,216,0.28)]">
              <Radar className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-xl font-extrabold tracking-[-0.05em] text-slate-900 sm:text-[22px]">
              deal<span className="font-medium">scout</span>
              <span className="text-indigo-500">.</span>
            </span>
          </NavLink>
          <div className="ml-auto flex items-center gap-1 sm:ml-8">
            <NavLink to="/" end className={link}>
              <Plus className="h-4 w-4" aria-hidden />
              <span className="sm:hidden">New</span>
              <span className="hidden sm:inline">New search</span>
            </NavLink>
            <NavLink to="/watches" className={link}>
              <Bell className="h-4 w-4" aria-hidden />
              <span className="sm:hidden">Watches</span>
              <span className="hidden sm:inline">My watches</span>
            </NavLink>
          </div>
          <p className="ml-auto hidden items-center gap-2 text-sm text-slate-500 lg:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-600" aria-hidden /> Price transparency, built in
          </p>
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-8 sm:py-14">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-3 px-4 py-6 text-[13px] text-slate-500 sm:px-8">
          <p className="max-w-xl">
            Prices from Google Shopping listings in India; picks researched by Gemini with Google Search.
            <br />
            Verify on the retailer's site before buying.
          </p>
          <p className="flex items-center gap-2" role="status">
            <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden /> API {state}
          </p>
        </div>
      </footer>
    </div>
  );
}
