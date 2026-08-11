import {
  FCC_EAS_API,
  extractRawFccRecords,
  normalizeFccRecord,
  normalizeFccScope,
  parseFccPayload,
  uniqueFccRecords,
  type NormalizedFccRecord,
} from "./fcc-core";

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { expires: number; records: NormalizedFccRecord[] }>();
const inflight = new Map<string, Promise<NormalizedFccRecord[]>>();
let directBrowserSupport: boolean | null = null;

function requestSignal(signal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("The FCC request timed out.", "TimeoutError")), 14_000);
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

function recordsFromPayload(payload: unknown, retrievedAt: string) {
  return extractRawFccRecords(payload)
    .map((raw) => normalizeFccRecord(raw, retrievedAt))
    .filter((record): record is NormalizedFccRecord => record !== null);
}

async function fetchDirect(normalized: string, signal: AbortSignal) {
  const response = await fetch(`${FCC_EAS_API}?fccId=${encodeURIComponent(normalized)}`, { signal });
  if (!response.ok && response.status !== 204) throw new Error(`FCC direct request returned ${response.status}.`);
  directBrowserSupport = true;
  if (response.status === 204) return [];
  const body = await response.text();
  return recordsFromPayload(parseFccPayload(body, response.headers.get("content-type") || ""), new Date().toISOString());
}

async function fetchProxy(normalized: string, signal: AbortSignal) {
  let response = await fetch(`/api/fcc/search?fccId=${encodeURIComponent(normalized)}`, {
    signal,
    headers: { accept: "application/json" },
  });
  if (response.status === 204) return [];
  if ([502, 503, 504].includes(response.status)) {
    response = await fetch(`/api/fcc/search?fccId=${encodeURIComponent(normalized)}`, {
      signal,
      headers: { accept: "application/json" },
    });
    if (response.status === 204) return [];
  }
  const body = await response.text();
  const payload = parseFccPayload(body, response.headers.get("content-type") || "");
  if (!response.ok) {
    const message = payload && typeof payload === "object" && !Array.isArray(payload) && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "The FCC Equipment Authorization source could not be reached.";
    throw new Error(message);
  }
  return recordsFromPayload(payload, new Date().toISOString());
}

async function fetchScope(scope: string, signal?: AbortSignal): Promise<NormalizedFccRecord[]> {
  const normalized = normalizeFccScope(scope);
  if (normalized.length < 3) throw new Error("Enter at least three FCC-ID characters or a complete grantee code.");

  const cached = cache.get(normalized);
  if (cached && cached.expires > Date.now()) return cached.records;
  const pending = inflight.get(normalized);
  if (pending) return pending;

  const request = (async () => {
    const timed = requestSignal(signal);
    try {
      let records: NormalizedFccRecord[] | undefined;
      if (typeof window !== "undefined" && directBrowserSupport !== false) {
        try {
          records = await fetchDirect(normalized, timed.signal);
        } catch (error) {
          if (timed.signal.aborted) throw error;
          directBrowserSupport = false;
        }
      }
      records ??= await fetchProxy(normalized, timed.signal);
      cache.set(normalized, { expires: Date.now() + CACHE_MS, records });
      return records;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof DOMException && error.name === "TimeoutError") throw new Error("The FCC source timed out. Try again.");
      throw error;
    } finally {
      timed.cleanup();
      inflight.delete(normalized);
    }
  })();
  inflight.set(normalized, request);
  return request;
}

export async function searchFcc(scopes: string[], signal?: AbortSignal) {
  const batches = await Promise.all(scopes.map((scope) => fetchScope(scope, signal)));
  return uniqueFccRecords(batches.flat());
}

export function clearFccCache(scopes?: string[]) {
  if (!scopes) cache.clear();
  else scopes.forEach((scope) => cache.delete(normalizeFccScope(scope)));
}
