import {
  EMPTY_FILTERS,
  PRESET_CODES,
  type ExplorerFilters,
  type Product,
  type RecordItem,
  companyName,
  firmName,
  listedDeviceNames,
  locationSummary,
  matchingProducts,
  normalizeCode,
  normalizeCodes,
  productFilterActive,
} from "../fda-shared.ts";

/*
 * Pure aggregation behind the FDA workspace. Everything here works on the
 * listing records openFDA returns for a scope and never calls the network,
 * so it is unit-tested directly.
 */

/** One product entry on one listing, inside the scope. */
export type ScopeProduct = {
  record: RecordItem;
  product: Product;
  code: string;
  createdDate: string;
  year: number | null;
};

export function scopeProducts(records: readonly RecordItem[], filters: ExplorerFilters): ScopeProduct[] {
  const out: ScopeProduct[] = [];
  records.forEach((record) => {
    matchingProducts(record, filters).forEach((product) => {
      const createdDate = String(product.created_date || "").slice(0, 10);
      out.push({
        record,
        product,
        code: normalizeCode(product.product_code) || "—",
        createdDate,
        year: /^\d{4}/.test(createdDate) ? Number(createdDate.slice(0, 4)) : null,
      });
    });
  });
  return out;
}

/** Owner/operator number when FDA publishes one, otherwise the normalized company name. */
export function companyKey(record: RecordItem) {
  const number = String(record.registration?.owner_operator?.owner_operator_number ?? "").trim();
  return number ? `op:${number}` : `name:${companyName(record).trim().toLowerCase()}`;
}

/**
 * The codes a scope is "about", in a fixed order so colours stay attached to
 * the same code across every view: selected codes as typed, otherwise the
 * codes present ranked by frequency.
 */
export function scopeCodes(filters: ExplorerFilters, products: readonly ScopeProduct[], max = 8) {
  const selected = normalizeCodes(filters.productCodes);
  if (selected.length) return selected;
  const counts = new Map<string, number>();
  products.forEach((entry) => counts.set(entry.code, (counts.get(entry.code) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([code]) => code);
}

export type Establishment = {
  registrationNumber: string;
  name: string;
  role: string;
  location: string;
  country: string;
  expiry: string;
  fei: string;
};

export type CompanyRow = {
  key: string;
  name: string;
  operatorNumber: string;
  listings: number;
  establishments: Establishment[];
  countries: string[];
  codes: string[];
  codeCounts: Record<string, number>;
  tradeNames: string[];
  premarket: string[];
  roles: string[];
  firstListed: string;
  latestListed: string;
  records: RecordItem[];
};

export function buildCompanies(records: readonly RecordItem[], filters: ExplorerFilters, orderedCodes: readonly string[] = []): CompanyRow[] {
  type Group = Omit<CompanyRow, "establishments" | "countries" | "codes" | "tradeNames" | "premarket" | "roles"> & {
    establishments: Map<string, Establishment>;
    countries: Set<string>;
    tradeNames: Map<string, string>;
    premarket: Set<string>;
    roles: Set<string>;
  };
  const groups = new Map<string, Group>();
  records.forEach((record) => {
    const key = companyKey(record);
    const group = groups.get(key) || {
      key,
      name: companyName(record),
      operatorNumber: String(record.registration?.owner_operator?.owner_operator_number ?? "").trim(),
      listings: 0,
      establishments: new Map<string, Establishment>(),
      countries: new Set<string>(),
      codeCounts: {},
      tradeNames: new Map<string, string>(),
      premarket: new Set<string>(),
      roles: new Set<string>(),
      firstListed: "",
      latestListed: "",
      records: [],
    };
    group.listings += 1;
    group.records.push(record);
    const registration = record.registration;
    const registrationNumber = String(registration?.registration_number || "").trim();
    const establishmentKey = registrationNumber || `${firmName(record)}|${locationSummary(record)}`.toLowerCase();
    if (!group.establishments.has(establishmentKey)) {
      group.establishments.set(establishmentKey, {
        registrationNumber: registrationNumber || "—",
        name: firmName(record),
        role: record.establishment_type?.[0] || "Role not listed",
        location: locationSummary(record),
        country: registration?.iso_country_code || "",
        expiry: registration?.reg_expiry_date_year || "",
        fei: registration?.fei_number || "",
      });
    }
    if (registration?.iso_country_code) group.countries.add(registration.iso_country_code);
    (record.establishment_type || []).forEach((role) => group.roles.add(role));
    [record.k_number, record.pma_number].forEach((value) => {
      const text = String(value ?? "").trim();
      if (text) group.premarket.add(text);
    });
    listedDeviceNames(record).forEach((name) => {
      const lower = name.toLocaleLowerCase();
      if (!group.tradeNames.has(lower)) group.tradeNames.set(lower, name);
    });
    const seenCodes = new Set<string>();
    matchingProducts(record, filters).forEach((product) => {
      const code = normalizeCode(product.product_code) || "—";
      if (!seenCodes.has(code)) {
        seenCodes.add(code);
        group.codeCounts[code] = (group.codeCounts[code] || 0) + 1;
      }
      const created = String(product.created_date || "").slice(0, 10);
      if (created) {
        if (!group.firstListed || created < group.firstListed) group.firstListed = created;
        if (created > group.latestListed) group.latestListed = created;
      }
    });
    groups.set(key, group);
  });
  const order = new Map(orderedCodes.map((code, index) => [code, index]));
  const codeSort = (a: string, b: string) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || a.localeCompare(b);
  return [...groups.values()]
    .map((group) => ({
      ...group,
      establishments: [...group.establishments.values()].sort((a, b) => a.name.localeCompare(b.name)),
      countries: [...group.countries].sort(),
      codes: Object.keys(group.codeCounts).sort(codeSort),
      tradeNames: [...group.tradeNames.values()].sort((a, b) => a.localeCompare(b)),
      premarket: [...group.premarket].sort(),
      roles: [...group.roles].sort(),
    }))
    .sort((a, b) => b.listings - a.listings || a.name.localeCompare(b.name));
}

export type BarDatum = { key: string; label: string; value: number; hint?: string };
export type YearBucket = { year: number; total: number; perCode: Record<string, number> };

export const OTHER_KEY = "__other";

export function timelineByYear(products: readonly ScopeProduct[], seriesCodes: readonly string[], maxYear?: number): YearBucket[] {
  const dated = products.filter((entry) => entry.year !== null);
  if (!dated.length) return [];
  const years = dated.map((entry) => entry.year as number);
  const min = Math.min(...years);
  const max = Math.max(Math.max(...years), maxYear ?? 0);
  const series = new Set(seriesCodes);
  const buckets = new Map<number, YearBucket>();
  for (let year = min; year <= max; year += 1) buckets.set(year, { year, total: 0, perCode: {} });
  dated.forEach((entry) => {
    const bucket = buckets.get(entry.year as number);
    if (!bucket) return;
    const key = series.has(entry.code) ? entry.code : OTHER_KEY;
    bucket.perCode[key] = (bucket.perCode[key] || 0) + 1;
    bucket.total += 1;
  });
  return [...buckets.values()];
}

function topWithOther(counts: Map<string, number>, limit: number, labelFor: (key: string) => string): BarDatum[] {
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const head = sorted.slice(0, limit).map(([key, value]) => ({ key, label: labelFor(key), value }));
  const rest = sorted.slice(limit).reduce((sum, [, value]) => sum + value, 0);
  if (rest > 0) head.push({ key: OTHER_KEY, label: `Other (${sorted.length - limit})`, value: rest });
  return head;
}

export type Overview = {
  listings: number;
  companies: number;
  establishments: number;
  countries: number;
  codes: string[];
  byCode: BarDatum[];
  byCountry: BarDatum[];
  byClass: BarDatum[];
  byRole: BarDatum[];
  byYear: YearBucket[];
  newCompanies: CompanyRow[];
  latest: ScopeProduct[];
};

export function isoDaysAgo(days: number, now = new Date()) {
  return new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
}

export function buildOverview(
  records: readonly RecordItem[],
  filters: ExplorerFilters,
  companies: readonly CompanyRow[],
  options: { now?: Date; regionName?: (code: string) => string; topCountries?: number } = {},
): Overview {
  const now = options.now ?? new Date();
  const regionName = options.regionName ?? ((code: string) => code);
  const products = scopeProducts(records, filters);
  const codes = scopeCodes(filters, products);
  const registrations = new Set<string>();
  const countries = new Map<string, number>();
  const roles = new Map<string, number>();
  const classes = new Map<string, number>();
  const byCodeCounts = new Map<string, number>(codes.map((code) => [code, 0]));
  records.forEach((record, index) => {
    registrations.add(String(record.registration?.registration_number || `record-${index}`));
    const country = record.registration?.iso_country_code || "Unknown";
    countries.set(country, (countries.get(country) || 0) + 1);
    (record.establishment_type?.length ? record.establishment_type : ["Role not listed"]).forEach((role) => roles.set(role, (roles.get(role) || 0) + 1));
    const present = new Set(matchingProducts(record, filters).map((product) => normalizeCode(product.product_code)));
    present.forEach((code) => {
      if (byCodeCounts.has(code)) byCodeCounts.set(code, (byCodeCounts.get(code) || 0) + 1);
    });
  });
  products.forEach((entry) => {
    const value = entry.product.openfda?.device_class || "U";
    classes.set(value, (classes.get(value) || 0) + 1);
  });
  const classLabel = (value: string) => (value === "U" ? "Unclassified" : `Class ${value}`);
  const cutoff = isoDaysAgo(365, now);
  return {
    listings: records.length,
    companies: companies.length,
    establishments: registrations.size,
    countries: [...countries.keys()].filter((code) => code !== "Unknown").length,
    codes,
    byCode: codes.map((code) => ({ key: code, label: code, value: byCodeCounts.get(code) || 0 })),
    byCountry: topWithOther(countries, options.topCountries ?? 8, (code) => (code === "Unknown" ? "Unknown" : regionName(code))),
    byClass: [...classes.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => ({ key, label: classLabel(key), value })),
    byRole: topWithOther(roles, 6, (role) => role),
    byYear: timelineByYear(products, codes, now.getFullYear()),
    newCompanies: companies
      .filter((company) => company.firstListed && company.firstListed >= cutoff)
      .sort((a, b) => b.firstListed.localeCompare(a.firstListed) || a.name.localeCompare(b.name)),
    latest: [...products].filter((entry) => entry.createdDate).sort((a, b) => b.createdDate.localeCompare(a.createdDate)).slice(0, 8),
  };
}

/** In-scope product entries whose listing date falls inside the window, newest first. */
export function newListingsWithin(products: readonly ScopeProduct[], days: number, now = new Date()) {
  const cutoff = isoDaysAgo(days, now);
  return products
    .filter((entry) => entry.createdDate && entry.createdDate >= cutoff)
    .sort((a, b) => b.createdDate.localeCompare(a.createdDate) || a.code.localeCompare(b.code));
}

export type SortDir = "asc" | "desc";

export function sortRows<T>(rows: readonly T[], accessor: (row: T) => string | number | null | undefined, dir: SortDir): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = accessor(a);
    const right = accessor(b);
    const leftEmpty = left === null || left === undefined || left === "";
    const rightEmpty = right === null || right === undefined || right === "";
    if (leftEmpty && rightEmpty) return 0;
    if (leftEmpty) return 1;
    if (rightEmpty) return -1;
    if (typeof left === "number" && typeof right === "number") return (left - right) * sign;
    return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" }) * sign;
  });
}

export function filterRows<T>(rows: readonly T[], query: string, text: (row: T) => string) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...rows];
  const terms = needle.split(/\s+/);
  return rows.filter((row) => {
    const haystack = text(row).toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/** Distinct in-scope listing dates per record, newest first — drives the Listings "latest" sort. */
export function latestListingDate(record: RecordItem, filters: ExplorerFilters) {
  return matchingProducts(record, filters)
    .map((product) => String(product.created_date || "").slice(0, 10))
    .filter(Boolean)
    .sort()
    .at(-1) || "";
}

export type CompareRow = { label: string; values: string[] };

export function compareCompanies(companies: readonly CompanyRow[], codes: readonly string[]): CompareRow[] {
  const list = (values: string[], max = 4) => (values.length ? `${values.slice(0, max).join(", ")}${values.length > max ? ` +${values.length - max}` : ""}` : "—");
  const rows: CompareRow[] = [
    { label: "Listings in scope", values: companies.map((company) => String(company.listings)) },
    { label: "Establishments", values: companies.map((company) => String(company.establishments.length)) },
    { label: "Countries", values: companies.map((company) => list(company.countries, 6)) },
    { label: "Codes covered", values: companies.map((company) => `${company.codes.length}${codes.length ? ` of ${codes.length}` : ""}`) },
  ];
  codes.forEach((code) => rows.push({ label: `${code} listings`, values: companies.map((company) => String(company.codeCounts[code] || 0)) }));
  rows.push(
    { label: "Trade names", values: companies.map((company) => `${company.tradeNames.length}${company.tradeNames.length ? ` · ${list(company.tradeNames, 3)}` : ""}`) },
    { label: "510(k) / PMA", values: companies.map((company) => list(company.premarket, 4)) },
    { label: "First listed in scope", values: companies.map((company) => company.firstListed || "—") },
    { label: "Latest listed in scope", values: companies.map((company) => company.latestListed || "—") },
    { label: "Establishment roles", values: companies.map((company) => list(company.roles, 3)) },
  );
  return rows;
}

/* ------------------------------------------------------------------ */
/* Scope matching                                                       */
/* ------------------------------------------------------------------ */

/**
 * How several selected codes combine. The workspace always fetches listings
 * carrying at least one code, then applies the level as a client-side lens:
 * - any      → every fetched listing.
 * - listing  → only listings that carry every selected code on that one filing.
 * - company  → listings of owner/operators whose listings, taken together,
 *              cover every selected code (two separate filings qualify).
 */
export type MatchLevel = "any" | "listing" | "company";

/**
 * The two levels the UI offers. An FDA record carries (almost always) one
 * product code, so "all codes" is a company-level question: the `listing`
 * level stays available to the core for completeness but is not exposed.
 */
export const MATCH_LEVELS: { value: MatchLevel; label: string; hint: string }[] = [
  { value: "any", label: "Any code", hint: "Companies and listings with at least one selected code." },
  { value: "company", label: "All codes · one company", hint: "Only companies whose listings, taken together, cover every selected code — and all of their in-scope listings." },
];

export function asMatchLevel(value: unknown): MatchLevel {
  return value === "all" || value === "company" ? "company" : value === "listing" ? "listing" : "any";
}

/** URL value for a level: `match=all` means the same thing it does on the current site (company-level). */
export function matchLevelParam(level: MatchLevel) {
  return level === "company" ? "all" : level === "listing" ? "listing" : "";
}

export function listingCodes(record: RecordItem, filters: ExplorerFilters) {
  return new Set(matchingProducts(record, filters).map((product) => normalizeCode(product.product_code)).filter(Boolean));
}

export function applyScopeMatch<T extends RecordItem>(records: readonly T[], filters: ExplorerFilters, level: MatchLevel): T[] {
  const selected = normalizeCodes(filters.productCodes);
  const withProduct = records.filter((record) => matchingProducts(record, filters).length > 0 || !productFilterActive(filters));
  if (!selected.length || level === "any") return withProduct;
  if (level === "listing") return withProduct.filter((record) => {
    const present = listingCodes(record, filters);
    return selected.every((code) => present.has(code));
  });
  const coverage = new Map<string, Set<string>>();
  withProduct.forEach((record) => {
    const key = companyKey(record);
    const codes = coverage.get(key) || new Set<string>();
    listingCodes(record, filters).forEach((code) => codes.add(code));
    coverage.set(key, codes);
  });
  return withProduct.filter((record) => selected.every((code) => coverage.get(companyKey(record))?.has(code)));
}

/* ------------------------------------------------------------------ */
/* Saved scopes                                                         */
/* ------------------------------------------------------------------ */

export type SavedScope = { id: string; name: string; filters: ExplorerFilters; level?: MatchLevel; builtIn?: boolean };

export const BUILT_IN_SCOPES: SavedScope[] = [
  { id: "hearing-aids", name: "Hearing aids · 6 codes", builtIn: true, filters: { ...EMPTY_FILTERS, productCodes: [...PRESET_CODES] } },
  { id: "otc-hearing-aids", name: "OTC hearing aids", builtIn: true, filters: { ...EMPTY_FILTERS, productCodes: ["QUF", "QUG", "QUH"] } },
  { id: "self-fitting-both", name: "Self-fitting · both codes", builtIn: true, level: "company", filters: { ...EMPTY_FILTERS, productCodes: ["QDD", "QUH"], codeMatch: "all" } },
  { id: "sonova", name: "Sonova listings", builtIn: true, filters: { ...EMPTY_FILTERS, keyword: "Sonova" } },
];

/** Canonical form of a scope, so two filter objects that mean the same thing compare equal. */
export function scopeSignature(filters: ExplorerFilters) {
  return JSON.stringify({
    kw: filters.keyword.trim().toLowerCase(),
    codes: normalizeCodes(filters.productCodes),
    match: filters.productCodes.length > 1 ? filters.codeMatch : "any",
    country: filters.country.trim().toUpperCase(),
    state: filters.state.trim().toUpperCase(),
    cls: filters.deviceClass,
    est: filters.establishment,
  });
}

export function scopeSummary(filters: ExplorerFilters) {
  const parts: string[] = [];
  const codes = normalizeCodes(filters.productCodes);
  if (codes.length) parts.push(`${codes.join(" · ")}${codes.length > 1 ? ` (${filters.codeMatch === "all" ? "all together" : "any"})` : ""}`);
  if (filters.keyword.trim()) parts.push(`“${filters.keyword.trim()}”`);
  if (filters.country.trim()) parts.push(filters.country.trim().toUpperCase());
  if (filters.state.trim()) parts.push(filters.state.trim().toUpperCase());
  if (filters.deviceClass) parts.push(filters.deviceClass === "U" ? "Unclassified" : `Class ${filters.deviceClass}`);
  if (filters.establishment) parts.push(filters.establishment);
  return parts.join(" · ") || "Whole registry";
}

export function parseSavedScopes(raw: string | null | undefined): SavedScope[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedScope => !!item && typeof item === "object" && typeof (item as SavedScope).id === "string" && typeof (item as SavedScope).name === "string" && !!(item as SavedScope).filters)
      .map((item) => ({
        id: item.id,
        name: item.name.slice(0, 60),
        level: asMatchLevel(item.level ?? (item.filters.codeMatch === "all" ? "company" : "any")),
        filters: {
          ...EMPTY_FILTERS,
          ...item.filters,
          productCodes: normalizeCodes(Array.isArray(item.filters.productCodes) ? item.filters.productCodes : []),
          codeMatch: item.filters.codeMatch === "all" ? "all" : "any",
        },
      }));
  } catch {
    return [];
  }
}
