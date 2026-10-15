import { ApiClientError } from "./errors";
import type {
  ApiError, Candidate, DetailsResponse, OffersResponse, ResearchResponse, ValidateResponse, Watch, WatchSpec,
} from "./types";
import * as mock from "./mock";

const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

// Must exceed the server's per-step Gemini timeout (120s) so a slow step still answers with its own error.
const PIPELINE_TIMEOUT_MS = 130_000;

async function apiFetch<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 30_000, signal: outer, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort(outer?.reason);
  outer?.addEventListener("abort", onOuterAbort);
  let res: Response;
  try {
    res = await fetch(path, {
      ...rest,
      signal: controller.signal,
      headers: { "content-type": "application/json", ...(rest.headers ?? {}) },
    });
  } catch (err) {
    if (outer?.aborted) throw err; // cancelled by the caller: not an error to show
    const aborted = (err as Error).name === "AbortError";
    throw new ApiClientError(
      "INTERNAL",
      aborted ? "This is taking longer than expected. Please try again." : "Can't reach DealScout right now. Check your connection and try again.",
      0,
    );
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuterAbort);
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

const post = <T>(path: string, data?: unknown, opts: { timeoutMs?: number; signal?: AbortSignal } = {}) =>
  apiFetch<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data), ...opts });

export interface SpecResponse {
  spec: WatchSpec;
  via: "gemini" | "heuristic";
  warnings: string[];
}

export const health = (): Promise<{ ok: boolean; version: string }> => (USE_MOCK ? mock.health() : apiFetch("/healthz"));

export const getSpec = (request: string): Promise<SpecResponse> =>
  USE_MOCK ? mock.getSpec(request) : post("/api/spec", { request });

// ---------- Search pipeline ----------

export const research = (spec: WatchSpec, signal?: AbortSignal): Promise<ResearchResponse> =>
  USE_MOCK ? mock.research(spec, signal) : post("/api/research", { spec }, { timeoutMs: PIPELINE_TIMEOUT_MS, signal });

/** Details for ONE model, so each card fills in as soon as its own research returns. */
export const researchDetails = (spec: WatchSpec, model: { id: string; name: string }, signal?: AbortSignal): Promise<DetailsResponse> =>
  USE_MOCK
    ? mock.researchDetails(spec, model, signal)
    : post("/api/research/details", { spec, models: [{ id: model.id, name: model.name }] }, { timeoutMs: PIPELINE_TIMEOUT_MS, signal });

export const offers = (spec: WatchSpec, models: { id: string; name: string }[], signal?: AbortSignal): Promise<OffersResponse> =>
  USE_MOCK
    ? mock.offers(spec, models, signal)
    : post("/api/offers", { models: models.map((m) => ({ id: m.id, name: m.name })) }, { timeoutMs: PIPELINE_TIMEOUT_MS, signal });

export const validate = (
  spec: WatchSpec,
  models: { id: string; name: string; stretch: boolean }[],
  candidates: Candidate[],
  signal?: AbortSignal,
): Promise<ValidateResponse> =>
  USE_MOCK
    ? mock.validate(spec, models, candidates, signal)
    : post(
        "/api/validate",
        { spec, models: models.map((m) => ({ id: m.id, name: m.name, stretch: m.stretch })), candidates },
        { timeoutMs: PIPELINE_TIMEOUT_MS, signal },
      );

// ---------- Digest & watches (v1.2; the server answers 501 NOT_IMPLEMENTED today) ----------

export const previewDigest = (spec: WatchSpec): Promise<{ subject: string; html: string }> =>
  USE_MOCK ? mock.notYet("Email digests") : post("/api/digest/preview", { spec }, { timeoutMs: PIPELINE_TIMEOUT_MS });

export const sendDigest = (spec: WatchSpec, email: string): Promise<{ sent: true; to: string }> =>
  USE_MOCK ? mock.notYet("Email digests") : post("/api/digest/send", { spec, email }, { timeoutMs: PIPELINE_TIMEOUT_MS });

export const createWatch = (spec: WatchSpec, email: string): Promise<Watch> =>
  USE_MOCK ? mock.notYet("Saved watches") : post("/api/watches", { spec, email });

export const listWatches = (): Promise<{ watches: Watch[] }> => (USE_MOCK ? mock.notYet("Saved watches") : apiFetch("/api/watches"));

export const getWatch = (id: string): Promise<Watch> => (USE_MOCK ? mock.notYet("Saved watches") : apiFetch(`/api/watches/${id}`));

export const checkWatch = (id: string): Promise<Watch> =>
  USE_MOCK ? mock.notYet("Saved watches") : post(`/api/watches/${id}/check`, undefined, { timeoutMs: PIPELINE_TIMEOUT_MS });

export const deleteWatch = (id: string): Promise<{ deleted: true }> =>
  USE_MOCK ? mock.notYet("Saved watches") : apiFetch(`/api/watches/${id}`, { method: "DELETE" });
