import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { WatchSpec } from "../types.ts";
import type { ScoutResponse } from "./apiTypes.ts";

/** Same need → same cache entry: category + budget + must-haves (case-insensitive, order-independent). */
export function cacheKey(spec: WatchSpec): string {
  const must = spec.mustHaves.map((m) => m.toLowerCase().trim()).sort().join(",");
  return `${spec.category.toLowerCase().trim()}|${spec.budget}|${must}`;
}

/**
 * Last successful LIVE result per need, used as the "cached" fallback.
 * JSON file for local dev; pass no path for in-memory only (tests). Moves to Firestore later.
 */
export class ResultCache {
  private data: Record<string, ScoutResponse> = {};
  private path?: string;

  constructor(path?: string) {
    this.path = path;
    if (path && existsSync(path)) {
      try {
        this.data = JSON.parse(readFileSync(path, "utf8"));
      } catch {
        console.warn(`Ignoring unreadable cache file ${path}`);
      }
    }
  }

  get(spec: WatchSpec): ScoutResponse | undefined {
    return this.data[cacheKey(spec)];
  }

  set(spec: WatchSpec, res: ScoutResponse): void {
    this.data[cacheKey(spec)] = res;
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, JSON.stringify(this.data));
  }
}
