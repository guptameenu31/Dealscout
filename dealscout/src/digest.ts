import type { ScoredProduct, WatchSpec } from "./types.ts";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function renderText(spec: WatchSpec, items: ScoredProduct[]): string {
  const group = (label: string) => items.filter((i) => i.verdict.label === label);
  const lines = [`DealScout digest: ${spec.category} under ${inr(spec.budget)}`, ""];
  const section = (title: string, list: ScoredProduct[]) => {
    if (!list.length) return;
    lines.push(title);
    for (const { product: p, verdict: v } of list) {
      lines.push(`  • ${p.name} (${p.store}): ${inr(p.currentPrice)}${v.fakeDiscount ? "  [fake discount]" : ""}`);
      for (const r of v.reasons) lines.push(`      ${r}`);
    }
    lines.push("");
  };
  section("BUY NOW", group("buy_now"));
  section("WAIT", group("wait"));
  const skipped = group("skip");
  if (skipped.length) lines.push(`Over budget, skipped: ${skipped.map((s) => s.product.name).join(", ")}`);
  return lines.join("\n");
}

export function renderHtml(spec: WatchSpec, items: ScoredProduct[]): string {
  const badge = { buy_now: ["#0a7d3c", "BUY NOW"], wait: ["#b26a00", "WAIT"], skip: ["#6b6b6b", "OVER BUDGET"] } as const;
  const card = ({ product: p, verdict: v }: ScoredProduct) => {
    const [color, text] = badge[v.label];
    return `<div style="border:1px solid #e3e3e3;border-radius:10px;padding:14px 16px;margin:10px 0">
  <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline">
    <a href="${esc(p.url)}" style="font-weight:600;color:#111;text-decoration:none">${esc(p.name)}</a>
    <span style="font-size:12px;font-weight:700;color:${color}">${text}</span>
  </div>
  <div style="color:#555;font-size:13px;margin:2px 0 6px">${esc(p.store)} · <b>${inr(p.currentPrice)}</b>${
    p.claimedOriginal ? ` <s style="color:#999">${inr(p.claimedOriginal)}</s>` : ""
  }${v.fakeDiscount ? ` <span style="color:#b00020;font-weight:600">· discount looks fake</span>` : ""}</div>
  <ul style="margin:0;padding-left:18px;font-size:13px;color:#333">${v.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
</div>`;
  };
  const sec = (title: string, label: string) => {
    const list = items.filter((i) => i.verdict.label === label);
    return list.length ? `<h3 style="margin:22px 0 4px">${title}</h3>${list.map(card).join("")}` : "";
  };
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,sans-serif;max-width:560px;margin:24px auto;padding:0 16px;color:#111">
<h2 style="margin-bottom:2px">DealScout digest</h2>
<div style="color:#666;font-size:14px">${esc(spec.category)} under ${inr(spec.budget)}</div>
${sec("Buy now", "buy_now")}${sec("Wait", "wait")}${sec("Over budget", "skip")}
</body></html>`;
}
