import {
  extractRawFccRecords,
  normalizeFccRecord,
  normalizeFccScope,
  uniqueFccRecords,
  type NormalizedFccRecord,
} from "./fcc-core";

const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { expires: number; records: NormalizedFccRecord[] }>();
const inflight = new Map<string, Promise<NormalizedFccRecord[]>>();

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
      let response = await fetch(`/api/fcc/search?fccId=${encodeURIComponent(normalized)}`, {
        signal: timed.signal,
        headers: { accept: "application/json" },
      });
      if (response.status === 204) return [];
      if ([502, 503, 504].includes(response.status) && !signal?.aborted) {
        response = await fetch(`/api/fcc/search?fccId=${encodeURIComponent(normalized)}`, {
          signal: timed.signal,
          headers: { accept: "application/json" },
        });
        if (response.status === 204) return [];
      }
      const payload = await response.json().catch(() => null) as { error?: string } | unknown;
      if (!response.ok) {
        const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "The FCC Equipment Authorization source could not be reached.";
        throw new Error(message);
      }
      const retrievedAt = new Date().toISOString();
      const records = extractRawFccRecords(payload)
        .map((raw) => normalizeFccRecord(raw, retrievedAt))
        .filter((record): record is NormalizedFccRecord => record !== null);
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
