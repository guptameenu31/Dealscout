import { ApiClientError } from "./errors";
import type { ApiError, ScoutMode, ScoutResponse, Watch, WatchSpec } from "./types";
import * as mock from "./mock";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

// Must exceed the server's LIVE_TIMEOUT_MS (90s) so a slow live search can still answer with its fallback.
const SCOUT_TIMEOUT_MS = 100_000;

async function apiFetch<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 30_000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(rest.headers ?? {}) },
    });
  } catch (err) {
    const aborted = (err as Error).name === "AbortError";
    throw new ApiClientError(
      "INTERNAL",
      aborted ? "This is taking longer than expected. Please try again." : "Can't reach DealScout right now. Check your connection and try again.",
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const e = (body as ApiError | null)?.error;
    throw new ApiClientError(e?.code ?? "INTERNAL", e?.message ?? "Something went wrong. Please try again.", res.status);
  }
  return body as T;
}

const post = <T>(path: string, data?: unknown, timeoutMs?: number) =>
  apiFetch<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data), timeoutMs });

export interface SpecResponse {
  spec: WatchSpec;
  via: "gemini" | "heuristic";
  warnings: string[];
}

export const health = (): Promise<{ ok: boolean; version: string }> => (USE_MOCK ? mock.health() : apiFetch("/healthz"));

export const getSpec = (request: string): Promise<SpecResponse> =>
  USE_MOCK ? mock.getSpec(request) : post("/api/spec", { request });

export const scout = (spec: WatchSpec, mode: ScoutMode = "auto"): Promise<ScoutResponse> =>
  USE_MOCK ? mock.scout(spec, mode) : post("/api/scout", { spec, mode }, SCOUT_TIMEOUT_MS);

export const previewDigest = (spec: WatchSpec, mode: ScoutMode = "auto"): Promise<{ subject: string; html: string }> =>
  USE_MOCK ? mock.previewDigest(spec, mode) : post("/api/digest/preview", { spec, mode }, SCOUT_TIMEOUT_MS);

export const sendDigest = (spec: WatchSpec, email: string, mode: ScoutMode = "auto"): Promise<{ sent: true; to: string }> =>
  USE_MOCK ? mock.sendDigest(spec, email) : post("/api/digest/send", { spec, email, mode }, SCOUT_TIMEOUT_MS);

export const createWatch = (spec: WatchSpec, email: string): Promise<Watch> =>
  USE_MOCK ? mock.createWatch(spec, email) : post("/api/watches", { spec, email });

export const listWatches = (): Promise<{ watches: Watch[] }> => (USE_MOCK ? mock.listWatches() : apiFetch("/api/watches"));

export const getWatch = (id: string): Promise<Watch> => (USE_MOCK ? mock.getWatch(id) : apiFetch(`/api/watches/${id}`));

export const checkWatch = (id: string): Promise<Watch> =>
  USE_MOCK ? mock.checkWatch(id) : post(`/api/watches/${id}/check`, undefined, SCOUT_TIMEOUT_MS);

export const deleteWatch = (id: string): Promise<{ deleted: true }> =>
  USE_MOCK ? mock.deleteWatch(id) : apiFetch(`/api/watches/${id}`, { method: "DELETE" });
