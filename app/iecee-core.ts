import {
  IECEE_MAX_QUERY_LENGTH,
  IECEE_RESULT_WINDOW,
  type IeceeSearchBody,
  type IeceeSortField,
  type IeceeTermGroup,
} from "./iecee-relay.ts";

/** Same-origin relay routes (see `app/iecee-relay.ts` for why the browser cannot call IECEE directly). */
export const IECEE_SEARCH_PATH = "/api/iecee/search";
export const IECEE_CERTIFICATE_PATH = "/api/iecee/certificate";
export const IECEE_TRADEMARKS_PATH = "/api/iecee/trademarks";

export const IECEE_PUBLIC_SEARCH_URL = "https://certificates.iecee.org/";
export const IECEE_PUBLIC_CERTIFICATE_URL = "https://certificates.iecee.org/deliverables/CERT/";
export const IECEE_HOME_URL = "https://www.iecee.org/";
export const IECEE_CATEGORIES_URL = "https://www.iecee.org/";
export const IECEE_SOURCE_LABEL = "IECEE CB Scheme certificate search (OCS)";
export const IECEE_EXPORT_CAP = IECEE_RESULT_WINDOW;
export const IECEE_PAGE_SIZES = [10, 25, 50, 100];

export type IeceeStatus = "VALID" | "CANCELLED" | "SUSPENDED";
export const IECEE_STATUSES: { code: IeceeStatus; label: string }[] = [
  { code: "VALID", label: "Valid" },
  { code: "CANCELLED", label: "Cancelled" },
  { code: "SUSPENDED", label: "Suspended" },
];

/** Certificate types as the IECEE index reports them (`type.level_1` → `type.level_1_display_name`). */
export const IECEE_TYPES: Record<string, string> = {
  "IECEE-CERTIFICATE-CBTEST": "CB Test Certificate",
  "IECEE-CERTIFICATE-COC": "Component Certificate",
  "IECEE-CERTIFICATE-EMC": "EMC Certificate",
  "IECEE-CERTIFICATE-ASP": "Aspect Certificate",
  "IECEE-CERTIFICATE-CYB": "Cyber Security Certificate",
  "IECEE-CERTIFICATE-STRE3": "E3 Statement of Test Result",
  "IECEE-CERTIFICATE-PV": "PV Certificate",
  "IECEE-CERTIFICATE-STRHSTS": "Statement of Test Result",
  "IECEE-CERTIFICATE-PVTYPE5": "PV5 Certificate",
};

/**
 * CB Scheme product-category names. The certificate index only carries the short codes, so this
 * app-maintained list mirrors the product-category list published on iecee.org (which blocks
 * automated fetches, so verify against the site by hand when adding a code). Codes the list does
 * not know are shown as codes, never guessed.
 */
export const IECEE_CATEGORIES: Record<string, string> = {
  BATT: "Batteries",
  CABL: "Cables and cords",
  CAP: "Capacitors as components",
  CONT: "Switches for appliances and automatic controls for electrical household appliances",
  CYBR: "Cyber security",
  E3: "Energy efficiency",
  ELVH: "Electric vehicles",
  EMC: "Electromagnetic compatibility",
  HOUS: "Household and similar equipment",
  HSTS: "Hazardous substances",
  INDA: "Industrial automation",
  INST: "Installation accessories and connection devices",
  ITAV: "Audio/video, information and communication technology equipment",
  LITE: "Lighting",
  MEAS: "Measurement, control and laboratory equipment",
  MED: "Electrical equipment for medical use",
  MISC: "Miscellaneous",
  OFF: "IT and office equipment",
  POW: "Low-voltage, high-power switching equipment",
  PROT: "Installation protective equipment",
  PV: "Photovoltaics",
  SAFE: "Safety transformers and similar equipment",
  TOOL: "Portable tools",
  TOYS: "Electric toys",
  TRON: "Electronics, entertainment",
};

export function ieceeCategoryName(code: string) {
  return IECEE_CATEGORIES[code.toUpperCase()];
}

export function ieceeCategoryLabel(code: string) {
  const name = ieceeCategoryName(code);
  return name ? `${code.toUpperCase()} · ${name}` : code.toUpperCase();
}

export function ieceeTypeLabel(code?: string, reported?: string) {
  if (!code) return reported || "Certificate";
  return reported || IECEE_TYPES[code] || code.replace(/^IECEE-CERTIFICATE-/, "");
}

export function ieceeStatusLabel(code?: string, reported?: string) {
  if (!code) return reported || "Unknown status";
  return reported || IECEE_STATUSES.find((status) => status.code === code)?.label || code;
}

export function asIeceeStatus(value: unknown): IeceeStatus | undefined {
  return IECEE_STATUSES.find((status) => status.code === String(value || "").toUpperCase())?.code;
}

export type IeceeStandardMatch = "any" | "all";

export type IeceeFilters = {
  /** Free text matched against manufacturer, applicant, trademark, product, model and certificate number. */
  query: string;
  statuses: IeceeStatus[];
  types: string[];
  categories: string[];
  /** Base standards ("IEC 60601-1") and editions ("IEC 60601-1:2005"). */
  standards: string[];
  /** With several standards: "any" keeps certificates citing at least one, "all" only those citing every one. */
  standardMatch: IeceeStandardMatch;
  /** National Certification Bodies, exactly as the index names them. */
  ncbs: string[];
  trademark: string;
  issuedFrom: string;
  issuedTo: string;
};

export const EMPTY_IECEE_FILTERS: IeceeFilters = {
  query: "",
  statuses: [],
  types: [],
  categories: [],
  standards: [],
  standardMatch: "any",
  ncbs: [],
  trademark: "",
  issuedFrom: "",
  issuedTo: "",
};

export type IeceeSort = "issued-desc" | "issued-asc" | "updated-desc" | "updated-asc" | "ref-asc" | "ref-desc";

export const IECEE_SORT_OPTIONS: { value: IeceeSort; label: string; field: IeceeSortField; direction: "asc" | "desc" }[] = [
  { value: "issued-desc", label: "Newest issued", field: "issue_date", direction: "desc" },
  { value: "issued-asc", label: "Oldest issued", field: "issue_date", direction: "asc" },
  { value: "updated-desc", label: "Recently updated", field: "last_update_date", direction: "desc" },
  { value: "updated-asc", label: "Least recently updated", field: "last_update_date", direction: "asc" },
  { value: "ref-asc", label: "Certificate number A→Z", field: "ref_number", direction: "asc" },
  { value: "ref-desc", label: "Certificate number Z→A", field: "ref_number", direction: "desc" },
];

export function asIeceeSort(value: unknown): IeceeSort {
  return IECEE_SORT_OPTIONS.some((option) => option.value === value) ? value as IeceeSort : "issued-desc";
}

export function ieceeSortBy(sort: IeceeSort): IeceeSearchBody["sortBy"] {
  const option = IECEE_SORT_OPTIONS.find((item) => item.value === sort) || IECEE_SORT_OPTIONS[0];
  return [{ [option.field]: option.direction } as IeceeSearchBody["sortBy"][number]];
}

export function parseIeceeQuery(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, IECEE_MAX_QUERY_LENGTH);
}

/** Tidies a typed standard so it matches the index keys: "iec 60601-1" and "60601-1" both become "IEC 60601-1". */
export function normalizeStandard(value: string) {
  let text = value.replace(/\s+/g, " ").trim();
  if (!text) return "";
  if (/^\d/.test(text)) text = `IEC ${text}`;
  // "IEC60601-1" has no word boundary between prefix and number, so match the prefix before a digit or space.
  text = text.replace(/^(iec|iso|en|ieee|ul)(?=[\s\d])\s*/i, (match) => `${match.trim().toUpperCase()} `);
  return text.replace(/\s*:\s*/g, ":").replace(/\s*\/\s*/g, "/");
}

/** Index level of a standard key: base standard = level 1, edition (contains a colon) = level 2. */
export function standardLevel(key: string): "1" | "2" {
  return key.includes(":") ? "2" : "1";
}

export function baseStandard(key: string) {
  return key.split(":")[0].trim();
}

export function normalizeIeceeFilters(filters: Partial<IeceeFilters>): IeceeFilters {
  const unique = (values: readonly string[] | undefined, transform: (value: string) => string = (value) => value.trim()) => {
    const seen: string[] = [];
    for (const value of values || []) {
      const cleaned = transform(String(value || ""));
      if (cleaned && !seen.includes(cleaned)) seen.push(cleaned);
    }
    return seen;
  };
  return {
    query: parseIeceeQuery(filters.query || ""),
    statuses: unique(filters.statuses, (value) => value.toUpperCase()).map(asIeceeStatus).filter((status): status is IeceeStatus => !!status),
    types: unique(filters.types, (value) => value.toUpperCase()),
    categories: unique(filters.categories, (value) => value.toUpperCase()),
    standards: unique(filters.standards, normalizeStandard),
    standardMatch: filters.standardMatch === "all" ? "all" : "any",
    ncbs: unique(filters.ncbs),
    trademark: (filters.trademark || "").replace(/\s+/g, " ").trim().slice(0, 100),
    issuedFrom: /^\d{4}-\d{2}-\d{2}$/.test(filters.issuedFrom || "") ? filters.issuedFrom! : "",
    issuedTo: /^\d{4}-\d{2}-\d{2}$/.test(filters.issuedTo || "") ? filters.issuedTo! : "",
  };
}

export function ieceeFiltersActive(filters: IeceeFilters) {
  return !!(filters.query || filters.statuses.length || filters.types.length || filters.categories.length || filters.standards.length || filters.ncbs.length || filters.trademark || filters.issuedFrom || filters.issuedTo);
}

export function countIeceeFilters(filters: IeceeFilters) {
  return Number(!!filters.query) + filters.statuses.length + filters.types.length + filters.categories.length + filters.standards.length + filters.ncbs.length + Number(!!filters.trademark) + Number(!!filters.issuedFrom || !!filters.issuedTo);
}

export type IeceePage = { from: number; size: number };

/** Builds the exact body the official certificate search posts, from the dashboard's filter state. */
export function buildIeceeRequest(filters: IeceeFilters, page: IeceePage, sort: IeceeSort = "issued-desc"): IeceeSearchBody {
  const clean = normalizeIeceeFilters(filters);
  const terms: IeceeSearchBody["terms"] = {};
  if (clean.statuses.length) terms.status = { "1": clean.statuses };
  if (clean.types.length) terms.type = { "1": clean.types };
  if (clean.categories.length) terms.scope_categories = { "1": clean.categories };
  if (clean.standards.length) {
    const levels: Record<string, string[]> = {};
    for (const standard of clean.standards) {
      const level = standardLevel(standard);
      levels[level] = [...(levels[level] || []), standard];
    }
    terms.scopes = levels;
  }
  if (clean.ncbs.length) terms.org_name = { "1": clean.ncbs };
  if (clean.trademark) terms["trademark.for_agg"] = { "1": [clean.trademark.toLowerCase()] };
  const dateRanges: IeceeSearchBody["dateRanges"] = {};
  if (clean.issuedFrom || clean.issuedTo) dateRanges.issue_date = { min: clean.issuedFrom || null, max: clean.issuedTo || null };
  const conjunctiveFacetGroups: IeceeTermGroup[] = clean.standardMatch === "all" && clean.standards.length > 1 ? ["scopes"] : [];
  return {
    from: Math.max(0, Math.floor(page.from)),
    size: Math.max(1, Math.floor(page.size)),
    query: clean.query,
    sortBy: ieceeSortBy(sort),
    dateRanges,
    conjunctiveFacetGroups,
    terms,
  };
}

export type RawIeceeRecord = Record<string, unknown>;

export type IeceeCertificate = {
  source: "IECEE";
  id: number;
  refNumber: string;
  subject: string;
  manufacturer: string;
  trademark?: string;
  ncb: string;
  ncbId?: number;
  ncbCountry?: string;
  ncbCountryCode?: string;
  type: string;
  typeLabel: string;
  status: string;
  statusLabel: string;
  categories: string[];
  /** Base standards cited, without edition or amendment ("IEC 60601-1"). */
  standards: string[];
  /** Every cited publication with edition and amendment ("IEC 60601-1:2005/AMD1:2012"). */
  scopes: string[];
  scopesJoined: string;
  issuedAt?: string;
  releasedAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  isPrivate: boolean;
  url: string;
  raw: RawIeceeRecord;
};

function text(raw: RawIeceeRecord | undefined, key: string) {
  const value = raw?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function record(value: unknown): RawIeceeRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawIeceeRecord : undefined;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && !!item.trim()).map((item) => item.trim()) : [];
}

/** "2026-09-16T00:00:00Z" → "2026-09-16". */
export function ieceeDay(value: unknown) {
  if (typeof value !== "string") return undefined;
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1];
}

export function ieceeCertificateUrl(id: number | string) {
  return `${IECEE_PUBLIC_CERTIFICATE_URL}${id}`;
}

export function normalizeIeceeHit(source: unknown): IeceeCertificate | null {
  const raw = record(source);
  if (!raw) return null;
  const id = Number(raw.id);
  const refNumber = text(raw, "ref_number");
  if (!Number.isFinite(id) || id <= 0 || !refNumber) return null;
  const org = record(raw.org);
  const address = record(org?.address);
  const country = record(address?.country);
  const type = record(raw.type);
  const status = record(raw.status);
  const scopeRows = Array.isArray(raw.scopes) ? raw.scopes.map(record).filter((row): row is RawIeceeRecord => !!row) : [];
  const scopes = [...new Set(scopeRows.map((row) => text(row, "level_3") || text(row, "level_2") || text(row, "level_1")).filter((value): value is string => !!value))];
  const standards = [...new Set(scopeRows.map((row) => text(row, "level_1")).filter((value): value is string => !!value))];
  const typeCode = text(type, "level_1") || "";
  const statusCode = (text(status, "level_1") || "").toUpperCase();
  return {
    source: "IECEE",
    id,
    refNumber,
    subject: text(raw, "subject") || "",
    manufacturer: text(raw, "manufacturer_name") || "",
    trademark: text(raw, "trademark"),
    ncb: text(raw, "org_name") || text(org, "name") || "",
    ncbId: Number.isFinite(Number(org?.id)) && Number(org?.id) > 0 ? Number(org?.id) : undefined,
    ncbCountry: text(country, "name"),
    ncbCountryCode: text(country, "iso2_code"),
    type: typeCode,
    typeLabel: ieceeTypeLabel(typeCode, text(type, "level_1_display_name")),
    status: statusCode,
    statusLabel: ieceeStatusLabel(statusCode, text(status, "level_1_display_name")),
    categories: strings(raw.scope_categories).map((code) => code.toUpperCase()),
    standards,
    scopes,
    scopesJoined: text(raw, "scopes_joined") || scopes.join(", "),
    issuedAt: ieceeDay(raw.issue_date),
    releasedAt: ieceeDay(raw.release_date),
    updatedAt: typeof raw.last_update_date === "string" ? raw.last_update_date : undefined,
    expiresAt: ieceeDay(raw.expiration_date),
    isPrivate: raw.is_private === true || raw.is_private === "Y",
    url: ieceeCertificateUrl(id),
    raw,
  };
}

export type IeceeFacetOption = {
  key: string;
  label: string;
  /** Certificates matching the current search including every applied filter. */
  count: number;
  /** Certificates matching the search text alone (before facet filters). */
  total: number;
  level: number;
  children: IeceeFacetOption[];
};

export type IeceeFacets = {
  status: IeceeFacetOption[];
  type: IeceeFacetOption[];
  categories: IeceeFacetOption[];
  standards: IeceeFacetOption[];
  ncbs: IeceeFacetOption[];
  issueDates: { min: string; max: string } | null;
};

export const EMPTY_IECEE_FACETS: IeceeFacets = { status: [], type: [], categories: [], standards: [], ncbs: [], issueDates: null };

type RawBucket = { key?: unknown; doc_count?: unknown; details?: unknown; nested?: unknown; nested_count?: unknown };

function bucketCount(bucket: RawBucket, cap: number) {
  const nestedCount = record(bucket.nested_count);
  const value = Number(nestedCount?.doc_count ?? bucket.doc_count ?? 0);
  return Math.min(Number.isFinite(value) ? value : 0, cap);
}

function bucketLabel(bucket: RawBucket, group: string, level: number) {
  const details = record(bucket.details);
  const top = Array.isArray(details?.top) ? record(details.top[0]) : undefined;
  const metrics = record(top?.metrics);
  const name = metrics?.[`${group}.level_${level}_display_name`];
  return typeof name === "string" && name.trim() ? name.trim() : String(bucket.key ?? "");
}

function childBuckets(bucket: RawBucket | RawIeceeRecord | undefined): RawBucket[] {
  const nested = record(bucket?.nested);
  return Array.isArray(nested?.buckets) ? nested.buckets.map(record).filter((row): row is RawBucket => !!row) : [];
}

function parseBuckets(buckets: RawBucket[], group: string, level: number, cap: number, current: Map<string, RawBucket> | null): IeceeFacetOption[] {
  return buckets.map((bucket) => {
    const key = String(bucket.key ?? "");
    const filtered = current ? current.get(key) : bucket;
    const currentChildren = filtered ? new Map(childBuckets(filtered).map((child) => [String(child.key ?? ""), child])) : new Map<string, RawBucket>();
    return {
      key,
      label: bucketLabel(bucket, group, level),
      count: filtered ? bucketCount(filtered, cap) : 0,
      total: bucketCount(bucket, cap),
      level,
      children: parseBuckets(childBuckets(bucket), group, level + 1, cap, current ? currentChildren : null),
    };
  }).filter((option) => option.key);
}

function facetGroup(aggregations: RawIeceeRecord | undefined, currentAggregations: RawIeceeRecord | undefined, group: IeceeTermGroup) {
  const agg = record(aggregations?.[`buckets#${group}`]);
  if (!agg) return [];
  const currentAgg = record(currentAggregations?.[`buckets#${group}`]);
  const cap = Number(agg.doc_count ?? Number.MAX_SAFE_INTEGER) || Number.MAX_SAFE_INTEGER;
  const currentIndex = currentAgg ? new Map(childBuckets(record(currentAgg.root)).map((bucket) => [String(bucket.key ?? ""), bucket])) : null;
  return parseBuckets(childBuckets(record(agg.root)), group, 1, cap, currentAggregations ? currentIndex : null);
}

function dateMetric(aggregations: RawIeceeRecord | undefined, name: string) {
  const metric = record(aggregations?.[`metrics#${name}`]);
  const nested = record(metric?.nested);
  return typeof nested?.value_as_string === "string" ? nested.value_as_string : undefined;
}

export function parseIeceeFacets(primaryAggregations: unknown, currentAggregations: unknown): IeceeFacets {
  const primary = record(primaryAggregations);
  const current = record(currentAggregations);
  const min = dateMetric(primary, "min_issue_date");
  const max = dateMetric(primary, "max_issue_date");
  return {
    status: facetGroup(primary, current, "status"),
    type: facetGroup(primary, current, "type"),
    categories: facetGroup(primary, current, "scope_categories"),
    standards: facetGroup(primary, current, "scopes"),
    ncbs: facetGroup(primary, current, "org_name"),
    issueDates: min && max ? { min, max } : null,
  };
}

export type IeceeSearchResult = {
  certificates: IeceeCertificate[];
  /** Certificates matching the search with every filter applied. */
  total: number;
  totalRelation: string;
  /** Certificates matching the search text before facet and date filters. */
  unfilteredTotal: number;
  from: number;
  size: number;
  /** True when the index holds more matches than the 10,000-result window exposes. */
  capped: boolean;
  facets: IeceeFacets;
  retrievedAt: string;
};

function hitsBlock(payload: RawIeceeRecord | undefined) {
  const hits = record(payload?.hits);
  const total = record(hits?.total);
  const rows = Array.isArray(hits?.hits) ? hits.hits.map(record).filter((row): row is RawIeceeRecord => !!row) : [];
  return {
    total: Number(total?.value ?? (typeof hits?.total === "number" ? hits.total : 0)) || 0,
    relation: typeof total?.relation === "string" ? total.relation : "eq",
    sources: rows.map((row) => row._source),
  };
}

/**
 * Reads a `/api/search-es` response. The index answers with two searches: `primary` (the search text
 * alone, which drives the full facet list) and `secondary` (text plus every facet/date filter, which
 * holds the actual results and per-option counts). Without filters both are identical.
 */
export function parseIeceeResponse(payload: unknown, page: IeceePage, retrievedAt = new Date().toISOString()): IeceeSearchResult {
  const root = record(payload);
  if (!root) throw new Error("The IECEE certificate search returned an unreadable response.");
  if (typeof root.message === "string" && !root.primary) throw new Error(root.message);
  const primary = record(root.primary);
  const secondary = record(root.secondary) || primary;
  if (!primary) throw new Error("The IECEE certificate search returned no result set.");
  const results = hitsBlock(secondary);
  const unfiltered = hitsBlock(primary);
  return {
    certificates: results.sources.map(normalizeIeceeHit).filter((item): item is IeceeCertificate => !!item),
    total: results.total,
    totalRelation: results.relation,
    unfilteredTotal: unfiltered.total,
    from: page.from,
    size: page.size,
    capped: results.total > IECEE_RESULT_WINDOW,
    facets: parseIeceeFacets(primary.aggregations, secondary?.aggregations),
    retrievedAt,
  };
}

/** The certificate number without its modification/amendment suffix: "CH-12254-A1" → "CH-12254", "FR_723076/M1" → "FR_723076". */
export function ieceeRefBase(refNumber: string) {
  let base = refNumber.trim();
  let previous = "";
  while (base !== previous) {
    previous = base;
    base = base.replace(/[-/_ ]?(?:M|A|MOD|AMD|R|REV)\d{1,3}$/i, "").trim();
  }
  return base || refNumber.trim();
}

export function isIeceeFamilyMember(refNumber: string, base: string) {
  const candidate = refNumber.trim().toUpperCase();
  const root = base.trim().toUpperCase();
  return candidate === root || (candidate.startsWith(root) && /^[-/_ ]/.test(candidate.slice(root.length)));
}

export function ieceeCertificatesInWindow(certificates: readonly IeceeCertificate[], cutoff: string, field: "issuedAt" | "updatedAt" = "issuedAt") {
  return certificates
    .filter((certificate) => {
      const value = certificate[field];
      return !!value && value.slice(0, 10) >= cutoff;
    })
    .sort((a, b) => (b[field] || "").localeCompare(a[field] || ""));
}

export type IeceeAppliedChip = { key: string; kind: "query" | "status" | "type" | "category" | "standard" | "standardMatch" | "ncb" | "trademark" | "issued"; value: string; label: string };

/** Removable chips describing the applied filters, in the order the filter pane lists them. */
export function ieceeAppliedChips(filters: IeceeFilters, typeLabels: ReadonlyMap<string, string> = new Map()): IeceeAppliedChip[] {
  const chips: IeceeAppliedChip[] = [];
  if (filters.query) chips.push({ key: "query", kind: "query", value: filters.query, label: `“${filters.query}”` });
  for (const status of filters.statuses) chips.push({ key: `status:${status}`, kind: "status", value: status, label: ieceeStatusLabel(status) });
  for (const type of filters.types) chips.push({ key: `type:${type}`, kind: "type", value: type, label: typeLabels.get(type) || ieceeTypeLabel(type) });
  for (const category of filters.categories) chips.push({ key: `category:${category}`, kind: "category", value: category, label: ieceeCategoryLabel(category) });
  for (const standard of filters.standards) chips.push({ key: `standard:${standard}`, kind: "standard", value: standard, label: standard });
  if (filters.standards.length > 1) chips.push({ key: "standardMatch", kind: "standardMatch", value: filters.standardMatch, label: filters.standardMatch === "all" ? "cites every standard" : "cites any standard" });
  for (const ncb of filters.ncbs) chips.push({ key: `ncb:${ncb}`, kind: "ncb", value: ncb, label: `NCB ${ncb}` });
  if (filters.trademark) chips.push({ key: "trademark", kind: "trademark", value: filters.trademark, label: `Trademark ${filters.trademark}` });
  if (filters.issuedFrom || filters.issuedTo) chips.push({ key: "issued", kind: "issued", value: `${filters.issuedFrom}..${filters.issuedTo}`, label: filters.issuedFrom && filters.issuedTo ? `Issued ${filters.issuedFrom} → ${filters.issuedTo}` : filters.issuedFrom ? `Issued from ${filters.issuedFrom}` : `Issued to ${filters.issuedTo}` });
  return chips;
}

export function removeIeceeChip(filters: IeceeFilters, chip: IeceeAppliedChip): IeceeFilters {
  switch (chip.kind) {
    case "query": return { ...filters, query: "" };
    case "status": return { ...filters, statuses: filters.statuses.filter((item) => item !== chip.value) };
    case "type": return { ...filters, types: filters.types.filter((item) => item !== chip.value) };
    case "category": return { ...filters, categories: filters.categories.filter((item) => item !== chip.value) };
    case "standard": return { ...filters, standards: filters.standards.filter((item) => item !== chip.value) };
    case "standardMatch": return { ...filters, standardMatch: "any" };
    case "ncb": return { ...filters, ncbs: filters.ncbs.filter((item) => item !== chip.value) };
    case "trademark": return { ...filters, trademark: "" };
    case "issued": return { ...filters, issuedFrom: "", issuedTo: "" };
    default: return filters;
  }
}

export function describeIeceeFilters(filters: IeceeFilters) {
  return ieceeAppliedChips(filters).map((chip) => chip.label).join(" · ") || "All certificates";
}

export type IeceeUrlState = { filters: IeceeFilters; sort: IeceeSort; pageSize: number; page: number; presetId: string };

export function ieceeStateToParams(state: IeceeUrlState) {
  const params = new URLSearchParams();
  const { filters } = state;
  if (state.presetId) params.set("preset", state.presetId);
  if (filters.query) params.set("q", filters.query);
  for (const status of filters.statuses) params.append("status", status);
  for (const type of filters.types) params.append("type", type);
  for (const category of filters.categories) params.append("cat", category);
  for (const standard of filters.standards) params.append("std", standard);
  if (filters.standardMatch === "all") params.set("stdmatch", "all");
  for (const ncb of filters.ncbs) params.append("ncb", ncb);
  if (filters.trademark) params.set("tm", filters.trademark);
  if (filters.issuedFrom) params.set("from", filters.issuedFrom);
  if (filters.issuedTo) params.set("to", filters.issuedTo);
  if (state.sort !== "issued-desc") params.set("sort", state.sort);
  if (state.pageSize !== 25) params.set("rows", String(state.pageSize));
  if (state.page > 0) params.set("page", String(state.page + 1));
  return params;
}

export function ieceeStateFromParams(params: URLSearchParams): IeceeUrlState {
  const rows = Number(params.get("rows"));
  const page = Number(params.get("page"));
  return {
    filters: normalizeIeceeFilters({
      query: params.get("q") || "",
      statuses: params.getAll("status") as IeceeStatus[],
      types: params.getAll("type"),
      categories: params.getAll("cat"),
      standards: params.getAll("std"),
      standardMatch: params.get("stdmatch") === "all" ? "all" : "any",
      ncbs: params.getAll("ncb"),
      trademark: params.get("tm") || "",
      issuedFrom: params.get("from") || "",
      issuedTo: params.get("to") || "",
    }),
    sort: asIeceeSort(params.get("sort")),
    pageSize: IECEE_PAGE_SIZES.includes(rows) ? rows : 25,
    page: Number.isInteger(page) && page > 1 ? page - 1 : 0,
    presetId: params.get("preset") || "",
  };
}

export type IeceeParty = { name: string; address?: string };

export type IeceeCertificateDetail = {
  id: number;
  refNumber: string;
  refIssueNumber?: string;
  issuedAt?: string;
  originIssuedAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  lastRevisionAt?: string;
  schemeCode?: string;
  isPrivate: boolean;
  model?: string;
  product?: string;
  rating?: string;
  trademark?: string;
  additionalInfo?: string;
  testReportRef?: string;
  testReportFactory?: string;
  testingLab?: string;
  factoryAuditReportRef?: string;
  nationalDifferences: string[];
  status: { code: string; label: string; message?: string };
  cancellation?: { by?: string; date?: string };
  type: { code: string; label: string };
  ncb: { id?: number; code?: string; name: string; kind?: string; address?: string; country?: string; countryCode?: string };
  manufacturers: IeceeParty[];
  factories: IeceeParty[];
  applicants: IeceeParty[];
  categories: string[];
  standards: string[];
  scopesComment?: string;
  hasPdf: boolean;
  url: string;
  raw: RawIeceeRecord;
};

function formatAddress(value: unknown) {
  const address = record(value);
  if (!address) return typeof value === "string" && value.trim() ? value.trim() : undefined;
  const country = record(address.country);
  const parts = [text(address, "line1"), text(address, "line2"), text(address, "line3"), text(address, "line4"), text(address, "line5"), [text(address, "postcode"), text(address, "town")].filter(Boolean).join(" "), text(address, "state_province"), text(country, "name")]
    .filter((part): part is string => !!part)
    .map((part) => part.replace(/\s*[\r\n]+\s*/g, ", "));
  return parts.length ? [...new Set(parts)].join(", ") : undefined;
}

function parties(value: unknown): IeceeParty[] {
  if (!Array.isArray(value)) return [];
  return value.map(record).filter((row): row is RawIeceeRecord => !!row).map((row) => ({ name: text(row, "name") || "", address: formatAddress(row.address) })).filter((party) => party.name);
}

export function normalizeIeceeDetail(payload: unknown): IeceeCertificateDetail | null {
  const raw = record(payload);
  if (!raw) return null;
  const id = Number(raw.id);
  const refNumber = text(raw, "ref_number");
  if (!Number.isFinite(id) || id <= 0 || !refNumber) return null;
  const status = record(raw.status);
  const cancel = record(raw.cancel_info);
  const template = record(raw.template);
  const org = record(raw.org);
  const address = record(org?.address);
  const country = record(address?.country);
  const scopeRows = Array.isArray(raw.scopes) ? raw.scopes.map(record).filter((row): row is RawIeceeRecord => !!row) : [];
  const statusCode = (text(status, "code") || "").toUpperCase();
  const typeCode = text(template, "code") || "";
  const file = record(raw.deliverable_file);
  return {
    id,
    refNumber,
    refIssueNumber: text(raw, "ref_issue_number"),
    issuedAt: ieceeDay(raw.issue_date),
    originIssuedAt: ieceeDay(raw.origin_issue_date),
    updatedAt: typeof raw.last_update_date === "string" ? raw.last_update_date : undefined,
    expiresAt: ieceeDay(raw.expiration_date),
    lastRevisionAt: ieceeDay(raw.last_revision_date),
    schemeCode: text(raw, "scheme_code"),
    isPrivate: raw.is_private === true || raw.is_private === "Y",
    model: text(raw, "model"),
    product: text(raw, "product"),
    rating: text(raw, "rating"),
    trademark: text(raw, "trademark"),
    additionalInfo: [text(raw, "additional_info"), text(raw, "additional_info2")].filter(Boolean).join("\n") || undefined,
    testReportRef: text(raw, "test_reportref"),
    testReportFactory: text(raw, "test_reportfac"),
    testingLab: text(raw, "testing_lab"),
    factoryAuditReportRef: text(raw, "factory_audit_reportref"),
    nationalDifferences: strings(raw.national_diffs),
    status: { code: statusCode, label: ieceeStatusLabel(statusCode, text(status, "name")), message: text(status, "status_message") },
    cancellation: cancel && (text(cancel, "cancelled_by") || text(cancel, "cancellation_date")) ? { by: text(cancel, "cancelled_by"), date: ieceeDay(cancel.cancellation_date) || text(cancel, "cancellation_date") } : undefined,
    type: { code: typeCode, label: ieceeTypeLabel(typeCode, text(template, "name")) },
    ncb: {
      id: Number.isFinite(Number(org?.id)) && Number(org?.id) > 0 ? Number(org?.id) : undefined,
      code: text(org, "code"),
      name: text(org, "name") || "",
      kind: text(org, "type"),
      address: formatAddress(address),
      country: text(country, "name"),
      countryCode: text(country, "iso2_code"),
    },
    manufacturers: parties(raw.manufacturer_org),
    factories: parties(raw.factory_org),
    applicants: parties(raw.applicant_org),
    categories: strings(raw.scope_categories).map((code) => code.toUpperCase()),
    standards: [...new Set(scopeRows.map((row) => text(row, "name")).filter((value): value is string => !!value))],
    scopesComment: text(raw, "scopes_comment"),
    hasPdf: !!text(file, "deliverable_pdf_file_name"),
    url: ieceeCertificateUrl(id),
    raw,
  };
}

export function ieceeSourcePresentation(retrieved = false) {
  if (!retrieved) return { status: "IECEE SOURCE READY", note: "Ready for certificate search" };
  return { status: "IECEE CERTIFICATES LIVE", note: "Official IECEE certificate index response" };
}
