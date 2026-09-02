import { useState } from "react";

export type Product = {
  product_code?: string;
  created_date?: string;
  owner_operator_number?: string;
  exempt?: string;
  openfda?: {
    device_name?: string;
    medical_specialty_description?: string;
    regulation_number?: string;
    device_class?: string;
  };
};

export type Registration = {
  registration_number?: string;
  fei_number?: string;
  status_code?: string;
  reg_expiry_date_year?: string;
  name?: string;
  business_name?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state_code?: string;
  iso_country_code?: string;
  zip_code?: string;
  postal_code?: string;
  owner_operator?: { firm_name?: string; owner_operator_number?: string };
  us_agent?: { business_name?: string; name?: string; email_address?: string };
};

/**
 * One openFDA registration-and-listing result.
 *
 * Each result is a single *device listing* filed under one establishment
 * registration. `products[]` carries one entry per product code on that
 * listing (usually exactly one), `proprietary_name[]` holds the trade names
 * for the listing, and `k_number` / `pma_number` are the premarket submission
 * behind it. The same registration number therefore appears once per listing
 * the establishment has filed — a record is a listing, not a company.
 */
export type RecordItem = {
  proprietary_name?: string[];
  establishment_type?: string[];
  registration?: Registration;
  pma_number?: string;
  k_number?: string;
  products?: Product[];
};

export const API = "https://api.fda.gov/device/registrationlisting.json";

export const PRESET = [
  { code: "QUF", name: "Hearing Aid, Air-Conduction, Over The Counter" },
  { code: "QUG", name: "Hearing Aid, Air-Conduction With Wireless Technology, Over The Counter" },
  { code: "QDD", name: "Self-Fitting Air-Conduction Hearing Aid, Prescription" },
  { code: "QUH", name: "Self-Fitting Air-Conduction Hearing Aid, Over The Counter" },
  { code: "OSM", name: "Hearing Aid, Air-Conduction With Wireless Technology, Prescription" },
  { code: "SCR", name: "Air-Conduction Hearing Aid Software" },
];
export const PRESET_CODES = PRESET.map((p) => p.code);
export const CODE_NAMES = new Map(PRESET.map((p) => [p.code, p.name]));

/* ------------------------------------------------------------------ */
/* Product-code matching                                                */
/* ------------------------------------------------------------------ */

/**
 * How several selected product codes combine in the Company + devices view.
 * A listing is one filing and (almost always) one product code, so the
 * Records view simply lists listings carrying at least one selected code.
 * ALL is a company-level question: which owner/operators hold listings that,
 * taken together, cover every selected code.
 */
export type CodeMatchMode = "any" | "all";

export const CODE_MATCH_MODES: { value: CodeMatchMode; label: string; hint: string }[] = [
  { value: "any", label: "Any selected code", hint: "ANY: companies with a listing for at least one selected product code." },
  { value: "all", label: "All selected codes", hint: "ALL: only companies whose listings, taken together, cover every selected product code." },
];

export function asCodeMatch(value: unknown): CodeMatchMode {
  return value === "all" ? "all" : "any";
}

/** Product codes are compared uppercase and trimmed — openFDA itself is case-sensitive and returns nothing for `qdd`. */
export function normalizeCode(code: unknown) {
  return String(code ?? "").trim().toUpperCase();
}

export function normalizeCodes(codes: readonly unknown[]) {
  return [...new Set(codes.map(normalizeCode).filter(Boolean))];
}

/** Every product code carried by one listing record. */
export function recordProductCodes(item: RecordItem) {
  return new Set((item.products || []).map((product) => normalizeCode(product.product_code)).filter(Boolean));
}

/* ------------------------------------------------------------------ */
/* openFDA query building                                               */
/* ------------------------------------------------------------------ */

export function quote(value: string) {
  return `"${value.replace(/["\\]/g, " ").trim()}"`;
}

export function parseCodes(text: string) {
  return [...new Set(
    text
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((code) => code.length >= 2 && code.length <= 8),
  )];
}

/**
 * openFDA clause for the selected codes. The request always asks for
 * listings carrying at least one code; the ALL rollup happens client-side
 * per company because no single listing can answer a cross-listing question.
 */
export function productCodeClause(codes: readonly string[]) {
  const quoted = normalizeCodes(codes).map(quote);
  if (!quoted.length) return "";
  if (quoted.length === 1) return `products.product_code:${quoted[0]}`;
  return `products.product_code:(${quoted.join(" OR ")})`;
}

export type ExplorerFilters = {
  keyword: string;
  productCodes: string[];
  codeMatch: CodeMatchMode;
  country: string;
  state: string;
  deviceClass: string;
  establishment: string;
};

export const EMPTY_FILTERS: ExplorerFilters = {
  keyword: "",
  productCodes: [],
  codeMatch: "any",
  country: "",
  state: "",
  deviceClass: "",
  establishment: "",
};

export function buildSearch(filters: ExplorerFilters) {
  const clauses: string[] = [];
  if (filters.keyword.trim()) {
    const value = quote(filters.keyword);
    clauses.push(
      `(registration.name:${value} OR registration.owner_operator.firm_name:${value} OR proprietary_name:${value} OR products.openfda.device_name:${value})`,
    );
  }
  const codeClause = productCodeClause(filters.productCodes);
  if (codeClause) clauses.push(codeClause);
  if (filters.country.trim())
    clauses.push(`registration.iso_country_code:${quote(filters.country.toUpperCase())}`);
  if (filters.state.trim())
    clauses.push(`registration.state_code:${quote(filters.state.toUpperCase())}`);
  if (filters.deviceClass)
    clauses.push(`products.openfda.device_class:${quote(filters.deviceClass)}`);
  if (filters.establishment)
    clauses.push(`establishment_type:${quote(filters.establishment)}`);
  return clauses.join(" AND ");
}

export function productFilterActive(filters: ExplorerFilters) {
  return filters.productCodes.length > 0 || !!filters.deviceClass;
}

/** True when ALL can change anything: the mode is ALL and at least two codes are selected. */
export function codeMatchApplies(filters: ExplorerFilters) {
  return filters.codeMatch === "all" && normalizeCodes(filters.productCodes).length > 1;
}

/** Products on this record that satisfy the product-level filters (code + class). */
export function matchingProducts(item: RecordItem, filters: ExplorerFilters) {
  const products = item.products || [];
  if (!productFilterActive(filters)) return products;
  const codeSet = new Set(normalizeCodes(filters.productCodes));
  return products.filter(
    (product) =>
      (!codeSet.size || codeSet.has(normalizeCode(product.product_code))) &&
      (!filters.deviceClass || product.openfda?.device_class === filters.deviceClass),
  );
}

/* ------------------------------------------------------------------ */
/* URL state                                                            */
/* ------------------------------------------------------------------ */

export type ExplorerView = "records" | "matrix";

export function filtersToParams(filters: ExplorerFilters, view: ExplorerView) {
  const params = new URLSearchParams();
  if (filters.productCodes.length) params.set("codes", filters.productCodes.join(","));
  if (filters.codeMatch === "all") params.set("match", "all");
  if (filters.keyword.trim()) params.set("kw", filters.keyword.trim());
  if (filters.country.trim()) params.set("country", filters.country.trim().toUpperCase());
  if (filters.state.trim()) params.set("state", filters.state.trim().toUpperCase());
  if (filters.deviceClass) params.set("class", filters.deviceClass);
  if (filters.establishment) params.set("est", filters.establishment);
  if (view === "matrix") params.set("view", "matrix");
  return params;
}

export function filtersFromParams(params: URLSearchParams) {
  const filters: ExplorerFilters = {
    keyword: params.get("kw") || "",
    productCodes: parseCodes(params.get("codes") || ""),
    codeMatch: asCodeMatch(params.get("match")),
    country: (params.get("country") || "").toUpperCase(),
    state: (params.get("state") || "").toUpperCase(),
    deviceClass: params.get("class") || "",
    establishment: params.get("est") || "",
  };
  const view: ExplorerView = params.get("view") === "matrix" ? "matrix" : "records";
  const autorun = !!(
    filters.keyword || filters.productCodes.length || filters.country ||
    filters.state || filters.deviceClass || filters.establishment
  );
  return { filters, view, autorun };
}

/* ------------------------------------------------------------------ */
/* Record helpers                                                       */
/* ------------------------------------------------------------------ */

export function firmName(item: RecordItem) {
  return (
    item.registration?.name ||
    item.registration?.business_name ||
    item.registration?.owner_operator?.firm_name ||
    "Unnamed establishment"
  );
}

export function companyName(item: RecordItem) {
  return item.registration?.owner_operator?.firm_name || firmName(item);
}

function normalizeCompany(name: string) {
  return name.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

/** Grouping key for one owner/operator. Derived from the FDA-reported firm name — the source data does not link listings to each other. */
export function companyKey(item: RecordItem) {
  return normalizeCompany(companyName(item));
}

export function locationSummary(item: RecordItem) {
  const r = item.registration;
  return [r?.city, r?.state_code, r?.iso_country_code].filter(Boolean).join(", ") || "Location unavailable";
}

/** 510(k) or PMA number behind the listing, when FDA published one. */
export function premarketSummary(item: RecordItem) {
  return [item.k_number, item.pma_number].map((value) => String(value ?? "").trim()).filter(Boolean).join(" · ");
}

export function listedDeviceNames(item: RecordItem) {
  const names = new Map<string, string>();
  (item.proprietary_name || []).forEach((rawName) => {
    rawName.split(/[;\n]+/).forEach((part) => {
      const name = part.replace(/\s+/g, " ").trim();
      const key = name.toLocaleLowerCase();
      if (name && !names.has(key)) names.set(key, name);
    });
  });
  return [...names.values()];
}

/* ------------------------------------------------------------------ */
/* Company-level code coverage                                          */
/* ------------------------------------------------------------------ */

/** Selected product codes each owner/operator covers across all of its listings in `items` (only products passing the code + class filters count). */
export function companyCodeCoverage(items: readonly RecordItem[], filters: ExplorerFilters) {
  const coverage = new Map<string, Set<string>>();
  items.forEach((item) => {
    const key = companyKey(item);
    const codes = coverage.get(key) || new Set<string>();
    matchingProducts(item, filters).forEach((product) => {
      const code = normalizeCode(product.product_code);
      if (code) codes.add(code);
    });
    coverage.set(key, codes);
  });
  return coverage;
}

/**
 * Owner/operators whose listings together cover every selected code. Two
 * separate listings (one per code) from the same firm qualify — that is the
 * company-level question ALL answers. Empty selection → no restriction.
 */
export function companiesCoveringAllCodes(items: readonly RecordItem[], filters: ExplorerFilters) {
  const selected = normalizeCodes(filters.productCodes);
  const matches = new Set<string>();
  if (!selected.length) return matches;
  companyCodeCoverage(items, filters).forEach((codes, key) => {
    if (selected.every((code) => codes.has(code))) matches.add(key);
  });
  return matches;
}

/* ------------------------------------------------------------------ */
/* Company + devices matrix                                             */
/* ------------------------------------------------------------------ */

export type MatrixRow = {
  key: string;
  productCode: string;
  deviceType: string;
  company: string;
  companyKey: string;
  devices: string[];
  registrations: number;
  productListings: number;
  establishments: number;
  deviceClasses: string[];
  specialties: string[];
  countries: string[];
  latestListing: string;
};

export type MatrixSort = "code" | "devices" | "company" | "registrations";

/**
 * Groups listing records by product code × device type × company. Only
 * products that pass the product-level filters contribute. With ALL and two
 * or more codes, rows are kept only for companies whose listings collectively
 * cover every selected code (see `companiesCoveringAllCodes`).
 */
export function buildMatrix(items: readonly RecordItem[], filters: ExplorerFilters): MatrixRow[] {
  const groups = new Map<string, {
    productCode: string;
    deviceType: string;
    company: string;
    companyKey: string;
    devices: Map<string, string>;
    registrationIds: Set<string>;
    productListings: number;
    establishments: Set<string>;
    deviceClasses: Set<string>;
    specialties: Set<string>;
    countries: Set<string>;
    latestListing: string;
  }>();
  const keep = codeMatchApplies(filters) ? companiesCoveringAllCodes(items, filters) : null;
  items.forEach((item, recordIndex) => {
    const company = companyName(item);
    const cKey = companyKey(item);
    if (keep && !keep.has(cKey)) return;
    const tradeNames = listedDeviceNames(item);
    matchingProducts(item, filters).forEach((product) => {
      const productCode = product.product_code || "—";
      const deviceType = product.openfda?.device_name || "Unspecified device type";
      const key = `${productCode.toLowerCase()}|${deviceType.toLowerCase()}|${cKey}`;
      const existing = groups.get(key) || {
        productCode,
        deviceType,
        company,
        companyKey: cKey,
        devices: new Map<string, string>(),
        registrationIds: new Set<string>(),
        productListings: 0,
        establishments: new Set<string>(),
        deviceClasses: new Set<string>(),
        specialties: new Set<string>(),
        countries: new Set<string>(),
        latestListing: "",
      };
      tradeNames.forEach((name) => {
        const normalized = name.toLocaleLowerCase();
        if (!existing.devices.has(normalized)) existing.devices.set(normalized, name);
      });
      existing.registrationIds.add(item.registration?.registration_number || `record-${recordIndex}`);
      existing.productListings += 1;
      existing.establishments.add(firmName(item));
      if (product.openfda?.device_class) existing.deviceClasses.add(product.openfda.device_class);
      if (product.openfda?.medical_specialty_description) existing.specialties.add(product.openfda.medical_specialty_description);
      if (item.registration?.iso_country_code) existing.countries.add(item.registration.iso_country_code);
      if (product.created_date && product.created_date > existing.latestListing) existing.latestListing = product.created_date;
      groups.set(key, existing);
    });
  });
  return [...groups.entries()]
    .map(([key, value]) => ({
      key,
      productCode: value.productCode,
      deviceType: value.deviceType,
      company: value.company,
      companyKey: value.companyKey,
      devices: [...value.devices.values()].sort((a, b) => a.localeCompare(b)),
      registrations: value.registrationIds.size,
      productListings: value.productListings,
      establishments: value.establishments.size,
      deviceClasses: [...value.deviceClasses].sort(),
      specialties: [...value.specialties].sort(),
      countries: [...value.countries].sort(),
      latestListing: value.latestListing,
    }))
    .sort((a, b) => a.productCode.localeCompare(b.productCode) || a.company.localeCompare(b.company));
}

/** Distinct owner/operators represented in a set of matrix rows. */
export function matrixCompanyCount(rows: readonly MatrixRow[]) {
  return new Set(rows.map((row) => row.companyKey)).size;
}

export function sortMatrixRows(rows: MatrixRow[], sort: MatrixSort) {
  return [...rows].sort((a, b) => {
    if (sort === "devices") return b.devices.length - a.devices.length || a.company.localeCompare(b.company);
    if (sort === "registrations") return b.registrations - a.registrations || a.company.localeCompare(b.company);
    if (sort === "company") return a.company.localeCompare(b.company) || a.productCode.localeCompare(b.productCode);
    return a.productCode.localeCompare(b.productCode) || a.company.localeCompare(b.company);
  });
}

/* ------------------------------------------------------------------ */
/* openFDA transport                                                    */
/* ------------------------------------------------------------------ */

export type OpenFdaMeta = { last_updated?: string; results?: { total?: number; skip?: number; limit?: number } };
export type OpenFdaError = { code?: string; message?: string };
export type OpenFdaResponse<T> = { meta?: OpenFdaMeta; results: T[]; error?: OpenFdaError };

/** openFDA answers a search with zero hits as HTTP 404 `NOT_FOUND` — that is an empty result set, not a failure. */
export function isNoMatches(status: number, data: { error?: OpenFdaError } | null | undefined) {
  if (status !== 404) return false;
  const error = data?.error;
  return !error || error.code === "NOT_FOUND" || /no matches/i.test(error.message || "");
}

export async function fetchOpenFda<T = unknown>(url: string): Promise<OpenFdaResponse<T>> {
  const response = await fetch(url);
  const data = (await response.json().catch(() => ({}))) as Partial<OpenFdaResponse<T>>;
  if (!response.ok) {
    if (isNoMatches(response.status, data)) return { meta: data.meta, results: [] };
    throw new Error(data.error?.message || `The openFDA request failed (HTTP ${response.status}).`);
  }
  return { meta: data.meta, results: data.results || [] };
}

/** openFDA serves at most 1,000 records per call and stops at skip 25,000. */
export const OPENFDA_PAGE = 1000;
export const EXPORT_CAP = 26000;
/** How many listings the Company + devices view loads before grouping — enough that company coverage is judged on the full set for any realistic code selection. */
export const MATRIX_FETCH_CAP = 5000;

/** Pages through a search (1,000 per call) until `cap` records or the last match. `onProgress` receives (loaded, target). */
export async function fetchListingPages<T>(
  baseUrl: string,
  search: string,
  cap: number,
  onProgress?: (loaded: number, target: number) => void,
): Promise<{ results: T[]; meta?: OpenFdaMeta; total: number }> {
  const results: T[] = [];
  let meta: OpenFdaMeta | undefined;
  let total = 0;
  for (let offset = 0; offset < Math.max(cap, 1); offset += OPENFDA_PAGE) {
    const params = new URLSearchParams({ limit: String(Math.min(OPENFDA_PAGE, Math.max(cap, 1) - offset)), skip: String(offset) });
    if (search) params.set("search", search);
    const page = await fetchOpenFda<T>(`${baseUrl}?${params.toString()}`);
    if (offset === 0) {
      meta = page.meta;
      total = page.meta?.results?.total || 0;
    }
    results.push(...page.results);
    const target = Math.min(total, cap);
    onProgress?.(results.length, target);
    if (!page.results.length || results.length >= target) break;
  }
  return { results, meta, total };
}

/** True on the internal dev deployment and local previews — drives the DEV badge. */
export function useDevHost() {
  const [dev] = useState(() => {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1" || host.includes("internaluseonly");
  });
  return dev;
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export function downloadCsv(rows: unknown[][], filename: string) {
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
