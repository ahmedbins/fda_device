import {
  API,
  type RecordItem,
  companyName,
  fetchOpenFda,
  locationSummary,
  quote,
} from "./fda-shared";

/*
 * openFDA feeds behind FDA Monitoring and the workspace "Changes" view:
 * new listings (registration & listing), 510(k) clearances, recalls and
 * MAUDE adverse events, normalized to flat rows with ISO dates.
 */

const API_510K = "https://api.fda.gov/device/510k.json";
const API_RECALL = "https://api.fda.gov/device/recall.json";
const API_EVENT = "https://api.fda.gov/device/event.json";
export const FETCH_LIMIT = 100;
export const WINDOWS = [30, 90, 180, 365];

export type NewListing = {
  createdDate: string;
  code: string;
  deviceName: string;
  company: string;
  location: string;
  regNumber: string;
};

export type Clearance = {
  decisionDate: string;
  kNumber: string;
  applicant: string;
  deviceName: string;
  code: string;
  decision: string;
  clearanceType: string;
};

export type RecallRow = {
  initiated: string;
  code: string;
  firm: string;
  product: string;
  reason: string;
  status: string;
  cfresId: string;
};

export type EventRow = {
  received: string;
  eventType: string;
  brand: string;
  manufacturer: string;
  code: string;
  reportKey: string;
};

export type Section<T> = {
  status: "loading" | "done" | "error";
  rows: T[];
  total: number;
  datasetDate: string;
  capped: boolean;
  error?: string;
};

export const EMPTY_SECTION = { status: "loading" as const, rows: [], total: 0, datasetDate: "", capped: false };

/** openFDA answers a zero-hit search with HTTP 404 — `fetchOpenFda` turns that into an empty section instead of an error. */
async function fetchJson(url: string) {
  return fetchOpenFda<unknown>(url);
}

export function codesClause(field: string, codes: string[]) {
  const quoted = codes.map(quote);
  return quoted.length === 1 ? `${field}:${quoted[0]}` : `${field}:(${quoted.join(" OR ")})`;
}

/** Normalizes openFDA dates — "20260630" and "2026-06-30" both become "2026-06-30". */
export function isoDate(raw?: string) {
  if (!raw) return "";
  if (/^\d{8}$/.test(raw)) return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  return raw.slice(0, 10);
}

export function cutoffIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

export async function loadListings(codes: string[]): Promise<Section<NewListing>> {
  const params = new URLSearchParams({ limit: "1000", search: codesClause("products.product_code", codes) });
  const data = await fetchJson(`${API}?${params.toString()}`);
  const records = (data.results || []) as RecordItem[];
  const codeSet = new Set(codes);
  const rows: NewListing[] = [];
  records.forEach((item) => {
    (item.products || []).forEach((product) => {
      const code = product.product_code?.toUpperCase() || "";
      if (!codeSet.has(code) || !product.created_date) return;
      rows.push({
        createdDate: isoDate(product.created_date),
        code,
        deviceName: product.openfda?.device_name || "Unspecified device type",
        company: companyName(item),
        location: locationSummary(item),
        regNumber: item.registration?.registration_number || "—",
      });
    });
  });
  rows.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
  const total = data.meta?.results?.total || 0;
  return { status: "done", rows, total: rows.length, datasetDate: data.meta?.last_updated || "", capped: total > 1000 };
}

export async function loadClearances(codes: string[]): Promise<Section<Clearance>> {
  const params = new URLSearchParams({
    search: codesClause("product_code", codes),
    sort: "decision_date:desc",
    limit: String(FETCH_LIMIT),
  });
  const data = await fetchJson(`${API_510K}?${params.toString()}`);
  const rows = ((data.results || []) as Record<string, string>[]).map((r) => ({
    decisionDate: isoDate(r.decision_date),
    kNumber: r.k_number || "",
    applicant: r.applicant || "—",
    deviceName: r.device_name || "—",
    code: r.product_code || "—",
    decision: r.decision_description || "—",
    clearanceType: r.clearance_type || "—",
  }));
  const total = data.meta?.results?.total || rows.length;
  return { status: "done", rows, total, datasetDate: data.meta?.last_updated || "", capped: total > FETCH_LIMIT };
}

export async function loadRecalls(codes: string[]): Promise<Section<RecallRow>> {
  const params = new URLSearchParams({
    search: codesClause("product_code", codes),
    sort: "event_date_initiated:desc",
    limit: String(FETCH_LIMIT),
  });
  const data = await fetchJson(`${API_RECALL}?${params.toString()}`);
  const rows = ((data.results || []) as Record<string, string>[]).map((r) => ({
    initiated: isoDate(r.event_date_initiated),
    code: r.product_code || "—",
    firm: r.recalling_firm || "—",
    product: r.product_description || "—",
    reason: r.reason_for_recall || "—",
    status: r.recall_status || "—",
    cfresId: r.cfres_id || "",
  }));
  const total = data.meta?.results?.total || rows.length;
  return { status: "done", rows, total, datasetDate: data.meta?.last_updated || "", capped: total > FETCH_LIMIT };
}

export async function loadEvents(codes: string[]): Promise<Section<EventRow>> {
  const params = new URLSearchParams({
    search: codesClause("device.device_report_product_code", codes),
    sort: "date_received:desc",
    limit: String(FETCH_LIMIT),
  });
  const data = await fetchJson(`${API_EVENT}?${params.toString()}`);
  type RawEvent = { date_received?: string; event_type?: string; mdr_report_key?: string; device?: { brand_name?: string; manufacturer_d_name?: string; device_report_product_code?: string }[] };
  const rows = ((data.results || []) as RawEvent[]).map((r) => {
    const device = r.device?.[0];
    return {
      received: isoDate(r.date_received),
      eventType: r.event_type || "Not specified",
      brand: device?.brand_name || "—",
      manufacturer: device?.manufacturer_d_name || "—",
      code: device?.device_report_product_code || "—",
      reportKey: r.mdr_report_key || "",
    };
  });
  const total = data.meta?.results?.total || rows.length;
  return { status: "done", rows, total, datasetDate: data.meta?.last_updated || "", capped: total > FETCH_LIMIT };
}

export function errorSection<T>(caught: unknown): Section<T> {
  return {
    ...EMPTY_SECTION,
    status: "error",
    rows: [],
    error: caught instanceof Error ? caught.message : "The openFDA request failed.",
  };
}
