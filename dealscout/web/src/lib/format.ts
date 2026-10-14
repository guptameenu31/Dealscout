const inrFmt = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export const inr = (n: number) => inrFmt.format(n);

/** Axis-friendly: 12549 -> "₹12.5k", 9000 -> "₹9k". */
export function inrShort(n: number): string {
  if (n < 1000) return `₹${Math.round(n)}`;
  const k = n / 1000;
  return `₹${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}

export const pct = (n: number) => `${Math.round(n)}%`;

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeTime(iso: string, now = Date.now()): string {
  const diff = (Date.parse(iso) - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return absoluteDate(iso);
}

export function absoluteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** "2026-09-12" -> "12 Sep" */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
