import {
  IECEE_CERTIFICATE_PATH,
  IECEE_EXPORT_CAP,
  IECEE_SEARCH_PATH,
  IECEE_TRADEMARKS_PATH,
  buildIeceeRequest,
  normalizeIeceeDetail,
  parseIeceeResponse,
  type IeceeCertificate,
  type IeceeCertificateDetail,
  type IeceeFilters,
  type IeceeSearchResult,
  type IeceeSort,
} from "./iecee-core.ts";
import { IECEE_MAX_PAGE, IECEE_RESULT_WINDOW } from "./iecee-relay.ts";

const CACHE_MS = 5 * 60 * 1000;
const DETAIL_CACHE_MS = 30 * 60 * 1000;
const searchCache = new Map<string, { expires: number; result: IeceeSearchResult }>();
const searchInflight = new Map<string, Promise<IeceeSearchResult>>();
const detailCache = new Map<number, { expires: number; detail: IeceeCertificateDetail }>();
const trademarkCache = new Map<string, { expires: number; options: IeceeTrademarkOption[] }>();

export type IeceeSearchOptions = {
  filters: IeceeFilters;
  from?: number;
  size?: number;
  sort?: IeceeSort;
  signal?: AbortSignal;
};

export type IeceeTrademarkOption = { key: string; label: string; count: number };

function requestSignal(signal?: AbortSignal, timeoutMs = 25_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("The IECEE certificate request timed out.", "TimeoutError")), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

async function relayError(response: Response, fallback: string) {
  let message = "";
  try {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
      if (typeof parsed?.error === "string") message = parsed.error;
      else if (typeof parsed?.message === "string") message = parsed.message;
    } catch {
      if (body && body.length < 200 && !/^\s*</.test(body)) message = body.trim();
    }
  } catch {
    // no readable body
  }
  return new Error(message || `${fallback} (HTTP ${response.status})`);
}

/** Runs one certificate search through the same-origin relay and returns the parsed page. */
export async function searchIecee(options: IeceeSearchOptions): Promise<IeceeSearchResult> {
  const page = { from: Math.max(0, options.from ?? 0), size: Math.min(IECEE_MAX_PAGE, Math.max(1, options.size ?? 25)) };
  if (page.from + page.size > IECEE_RESULT_WINDOW) throw new Error(`IECEE only exposes the first ${IECEE_RESULT_WINDOW.toLocaleString()} results of a search. Narrow the search to reach later certificates.`);
  const body = buildIeceeRequest(options.filters, page, options.sort ?? "issued-desc");
  const key = JSON.stringify(body);
  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.result;
  const pending = searchInflight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const timed = requestSignal(options.signal);
    try {
      const response = await fetch(IECEE_SEARCH_PATH, {
        method: "POST",
        signal: timed.signal,
        headers: { "content-type": "application/json", accept: "application/json" },
        body: key,
      });
      if (!response.ok) throw await relayError(response, "The IECEE certificate search could not be reached.");
      const result = parseIeceeResponse(await response.json(), page, new Date().toISOString());
      searchCache.set(key, { expires: Date.now() + CACHE_MS, result });
      return result;
    } finally {
      timed.cleanup();
      searchInflight.delete(key);
    }
  })();
  searchInflight.set(key, request);
  return request;
}

/** Loads the full public record of one certificate (model, ratings, standards, parties, national differences). */
export async function fetchIeceeCertificate(id: number, signal?: AbortSignal): Promise<IeceeCertificateDetail> {
  const cached = detailCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.detail;
  const timed = requestSignal(signal);
  try {
    const response = await fetch(`${IECEE_CERTIFICATE_PATH}?id=${encodeURIComponent(String(id))}`, { signal: timed.signal, headers: { accept: "application/json" } });
    if (response.status === 404) throw new Error(`IECEE has no public record for certificate id ${id}.`);
    if (!response.ok) throw await relayError(response, "The IECEE certificate record could not be loaded.");
    const detail = normalizeIeceeDetail(await response.json());
    if (!detail) throw new Error("The IECEE certificate record was empty.");
    detailCache.set(id, { expires: Date.now() + DETAIL_CACHE_MS, detail });
    return detail;
  } finally {
    timed.cleanup();
  }
}

/** Trademark suggestions from the official search, with certificate counts. */
export async function fetchIeceeTrademarks(query: string, signal?: AbortSignal): Promise<IeceeTrademarkOption[]> {
  const cleaned = query.replace(/\s+/g, " ").trim().toLowerCase();
  if (cleaned.length < 2) return [];
  const cached = trademarkCache.get(cleaned);
  if (cached && cached.expires > Date.now()) return cached.options;
  const timed = requestSignal(signal, 15_000);
  try {
    const response = await fetch(`${IECEE_TRADEMARKS_PATH}?q=${encodeURIComponent(cleaned)}`, { signal: timed.signal, headers: { accept: "application/json" } });
    if (!response.ok) return [];
    const payload = await response.json() as { aggregations?: { main?: { buckets?: { key?: unknown; doc_count?: unknown; details?: { top?: { metrics?: Record<string, unknown> }[] } }[] } } };
    const buckets = payload?.aggregations?.main?.buckets || [];
    const options = buckets.map((bucket) => {
      const label = bucket.details?.top?.[0]?.metrics?.["trademark.raw"];
      return { key: String(bucket.key ?? ""), label: typeof label === "string" && label ? label : String(bucket.key ?? ""), count: Number(bucket.doc_count) || 0 };
    }).filter((option) => option.key);
    trademarkCache.set(cleaned, { expires: Date.now() + CACHE_MS, options });
    return options;
  } catch {
    return [];
  } finally {
    timed.cleanup();
  }
}

export type IeceeBulkOptions = {
  filters: IeceeFilters;
  sort?: IeceeSort;
  cap?: number;
  signal?: AbortSignal;
  onProgress?: (loaded: number, expected: number) => void;
};

/** Pages through a search 1,000 certificates at a time, up to the export cap or the 10,000-result window. */
export async function fetchIeceeCertificatesAll(options: IeceeBulkOptions) {
  const cap = Math.min(options.cap ?? IECEE_EXPORT_CAP, IECEE_RESULT_WINDOW);
  const certificates: IeceeCertificate[] = [];
  let total = 0;
  let from = 0;
  while (from < cap) {
    const size = Math.min(IECEE_MAX_PAGE, cap - from);
    const page = await searchIecee({ filters: options.filters, sort: options.sort, from, size, signal: options.signal });
    total = page.total;
    certificates.push(...page.certificates);
    from += page.certificates.length;
    options.onProgress?.(certificates.length, Math.min(total, cap));
    if (!page.certificates.length || from >= Math.min(total, cap)) break;
  }
  return { certificates, total, capped: total > cap };
}

export function clearIeceeCache() {
  searchCache.clear();
  searchInflight.clear();
  detailCache.clear();
  trademarkCache.clear();
}
