import {
  FCC_EAS_API,
  FCC_GRANTEE_API,
  FCC_GRANTEE_DATASET,
  extractRawFccRecords,
  normalizeFccRecord,
  normalizeFccScope,
  parseFccPayload,
  uniqueFccRecords,
  type FccGranteeRegistration,
  type FccSearchResult,
  type NormalizedFccRecord,
  type RawFccRecord,
} from "./fcc-core";
import { parseFccidMarkdown } from "./fcc-index";
import { FCC_OFFICIAL_SNAPSHOT } from "./fcc-official-snapshot";
import { FCC_OFFICIAL_GRANTS } from "./fcc-official-grants";

const CACHE_MS = 5 * 60 * 1000;
type ScopeResult = { records: NormalizedFccRecord[]; resolved: boolean; sourceMode?: "live" | "official_snapshot" | "public_index" };

const cache = new Map<string, { expires: number; result: ScopeResult }>();
const inflight = new Map<string, Promise<ScopeResult>>();
let directBrowserSupport: boolean | null = null;
const confirmedCodes = FCC_OFFICIAL_SNAPSHOT.scopes.map((scope) => scope.scope);

function applyOfficialGrantFields(record: NormalizedFccRecord): NormalizedFccRecord {
  const extra = FCC_OFFICIAL_GRANTS[record.fccId];
  if (!extra) return record;
  return {
    ...record,
    equipmentClasses: record.equipmentClasses?.length ? record.equipmentClasses : extra.equipmentClasses.length ? extra.equipmentClasses : record.equipmentClasses,
    equipmentDescription: record.equipmentDescription || extra.descriptions[0] || record.equipmentDescription,
    rfBands: record.rfBands?.length ? record.rfBands : extra.bands.length ? extra.bands : record.rfBands,
  };
}

const snapshotRecords = (FCC_OFFICIAL_SNAPSHOT.records as readonly RawFccRecord[])
  .map((raw) => normalizeFccRecord(raw, FCC_OFFICIAL_SNAPSHOT.capturedAt, {
    confirmedCodes,
    sourceMode: "official_snapshot",
    snapshotCapturedAt: FCC_OFFICIAL_SNAPSHOT.capturedAt,
  }))
  .filter((record): record is NormalizedFccRecord => record !== null)
  .map(applyOfficialGrantFields);

function requestSignal(signal?: AbortSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException("The FCC request timed out.", "TimeoutError")), 22_000);
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

function recordsFromPayload(payload: unknown, retrievedAt: string, sourceMode: NormalizedFccRecord["sourceMode"] = "live") {
  return extractRawFccRecords(payload)
    .map((raw) => normalizeFccRecord(raw, retrievedAt, { confirmedCodes, sourceMode }))
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

async function fetchProxy(normalized: string, signal: AbortSignal): Promise<{ records: NormalizedFccRecord[]; sourceMode: "live" | "public_index" }> {
  let response = await fetch(`/api/fcc/search?fccId=${encodeURIComponent(normalized)}`, {
    signal,
    headers: { accept: "application/json" },
  });
  if (response.status === 204) return { records: [], sourceMode: "live" };
  if ([502, 503, 504].includes(response.status)) {
    response = await fetch(`/api/fcc/search?fccId=${encodeURIComponent(normalized)}`, {
      signal,
      headers: { accept: "application/json" },
    });
    if (response.status === 204) return { records: [], sourceMode: "live" };
  }
  const body = await response.text();
  if (!response.ok) {
    const payload = parseFccPayload(body, response.headers.get("content-type") || "");
    const message = payload && typeof payload === "object" && !Array.isArray(payload) && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "The FCC Equipment Authorization source could not be reached.";
    throw new Error(message);
  }
  const retrievedAt = new Date().toISOString();
  try {
    const parsed = JSON.parse(body) as { source?: string; pages?: string[] };
    if (parsed?.source === "fccid.io" && Array.isArray(parsed.pages)) {
      return {
        records: uniqueFccRecords(parsed.pages.flatMap((page) => parseFccidMarkdown(page, retrievedAt, confirmedCodes))),
        sourceMode: "public_index",
      };
    }
  } catch {
    // Official XML/JSON payload.
  }
  return { records: recordsFromPayload(parseFccPayload(body, response.headers.get("content-type") || ""), retrievedAt), sourceMode: "live" };
}

async function fetchScope(scope: string, signal?: AbortSignal): Promise<ScopeResult> {
  const normalized = normalizeFccScope(scope);
  if (normalized.length < 3) throw new Error("Enter at least three FCC-ID characters or a complete grantee code.");

  const cached = cache.get(normalized);
  if (cached && cached.expires > Date.now()) return cached.result;
  const pending = inflight.get(normalized);
  if (pending) return pending;

  const request = (async () => {
    const timed = requestSignal(signal);
    try {
      let records: NormalizedFccRecord[] | undefined;
      let sourceMode: ScopeResult["sourceMode"] = "live";
      if (typeof window !== "undefined" && directBrowserSupport !== false) {
        try {
          records = await fetchDirect(normalized, timed.signal);
        } catch (error) {
          if (timed.signal.aborted) throw error;
          directBrowserSupport = false;
        }
      }
      if (!records) {
        try {
          const proxied = await fetchProxy(normalized, timed.signal);
          records = proxied.records;
          sourceMode = proxied.sourceMode;
        } catch (error) {
          if (timed.signal.aborted) throw error;
        }
      }
      if (!records?.length) {
        const local = snapshotRecords.filter((record) => record.fccId.startsWith(normalized));
        if (local.length) {
          const retrievedAt = new Date().toISOString();
          const result: ScopeResult = {
            records: local.map((record) => ({ ...record, retrievedAt })),
            resolved: true,
            sourceMode: "official_snapshot",
          };
          cache.set(normalized, { expires: Date.now() + CACHE_MS, result });
          return result;
        }
        const result: ScopeResult = { records: [], resolved: false };
        cache.set(normalized, { expires: Date.now() + 30_000, result });
        return result;
      }
      const result: ScopeResult = { records, resolved: true, sourceMode };
      cache.set(normalized, { expires: Date.now() + CACHE_MS, result });
      return result;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (timed.signal.aborted) {
        const result: ScopeResult = { records: [], resolved: false };
        cache.set(normalized, { expires: Date.now() + 30_000, result });
        return result;
      }
      throw error;
    } finally {
      timed.cleanup();
      inflight.delete(normalized);
    }
  })();
  inflight.set(normalized, request);
  return request;
}

async function fetchGranteeRegistrations(scopes: string[], signal?: AbortSignal): Promise<FccGranteeRegistration[]> {
  const codes = [...new Set(confirmedCodes.filter((code) => scopes.some((scope) => normalizeFccScope(scope).startsWith(code))))];
  if (!codes.length) return [];
  const where = codes.map((code) => `grantee_code='${code.replaceAll("'", "''")}'`).join(" or ");
  try {
    const response = await fetch(`${FCC_GRANTEE_API}?$limit=100&$where=${encodeURIComponent(where)}`, { signal });
    if (!response.ok) return [];
    const rows = await response.json() as Record<string, string>[];
    return rows.map((row) => ({
      granteeCode: row.grantee_code,
      granteeName: row.grantee_name,
      mailingAddress: row.mailing_address,
      poBox: row.po_box,
      city: row.city,
      state: row.state,
      country: row.country,
      zipCode: row.zip_code,
      contactName: row.contact_name,
      dateReceived: row.date_received?.slice(0, 10),
      sourceUrl: FCC_GRANTEE_DATASET,
    }));
  } catch {
    return [];
  }
}

export async function searchFcc(scopes: string[], signal?: AbortSignal): Promise<FccSearchResult> {
  const batches = await Promise.all(scopes.map((scope) => fetchScope(scope, signal)));
  const normalizedScopes = scopes.map(normalizeFccScope);
  const resolvedScopes = normalizedScopes.filter((_, index) => batches[index].resolved);
  const unresolvedScopes = normalizedScopes.filter((_, index) => !batches[index].resolved);
  const records = uniqueFccRecords(batches.flatMap((batch) => batch.records)).map(applyOfficialGrantFields);
  const grantees = await fetchGranteeRegistrations(normalizedScopes, signal);
  const modes = new Set(batches.map((batch) => batch.sourceMode).filter(Boolean));
  const sourceMode: FccSearchResult["sourceMode"] = unresolvedScopes.length && !records.length
    ? "limited"
    : modes.size > 1
      ? "mixed"
      : modes.has("live")
        ? "live"
        : modes.has("public_index")
          ? "public_index"
          : "official_snapshot";
  return {
    records,
    grantees,
    retrievedAt: new Date().toISOString(),
    sourceMode,
    snapshotCapturedAt: sourceMode === "official_snapshot" || sourceMode === "mixed" ? FCC_OFFICIAL_SNAPSHOT.capturedAt : undefined,
    resolvedScopes,
    unresolvedScopes,
  };
}

export function importOfficialFccResponse(body: string, scopes: string[] = []): NormalizedFccRecord[] {
  const importedAt = new Date().toISOString();
  const payload = parseFccPayload(body);
  return uniqueFccRecords(extractRawFccRecords(payload)
    .map((raw) => normalizeFccRecord(raw, importedAt, { confirmedCodes: [...confirmedCodes, ...scopes], sourceMode: "official_import" }))
    .filter((record): record is NormalizedFccRecord => record !== null)
    .map(applyOfficialGrantFields));
}

export function clearFccCache(scopes?: string[]) {
  if (!scopes) cache.clear();
  else scopes.forEach((scope) => cache.delete(normalizeFccScope(scope)));
}
