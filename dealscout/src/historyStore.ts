import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { PricePoint } from "./types.ts";

const today = () => new Date().toISOString().slice(0, 10);

/** Tiny JSON-file price history. Stand-in for Firestore; same shape (productId -> daily prices). */
export class HistoryStore {
  private data: Record<string, PricePoint[]> = {};
  private path: string;

  constructor(path: string) {
    this.path = path;
    if (existsSync(path)) this.data = JSON.parse(readFileSync(path, "utf8"));
  }

  /** Record today's price (replaces an earlier snapshot from the same day). */
  record(id: string, price: number, date = today()): void {
    const list = (this.data[id] ??= []).filter((p) => p.date !== date);
    list.push({ date, price });
    this.data[id] = list.sort((a, b) => a.date.localeCompare(b.date));
  }

  /** History before today, oldest first (the verdict logic expects today's price excluded). */
  get(id: string): PricePoint[] {
    return (this.data[id] ?? []).filter((p) => p.date < today());
  }

  /**
   * DEMO ONLY: backfill synthetic history around the current price for products we have just
   * started tracking, so the fake-discount check has something to show on day one.
   */
  seedSynthetic(id: string, currentPrice: number, days = 45): boolean {
    if (this.get(id).length > 0) return false;
    let s = [...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = days; i >= 1; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      this.record(id, Math.round(currentPrice * (1.03 + (rand() - 0.5) * 0.06)), d.toISOString().slice(0, 10));
    }
    return true;
  }

  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data, null, 1));
  }
}
