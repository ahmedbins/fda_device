/**
 * Shared rules for the same-origin IECEE relay.
 *
 * The IECEE certificate search API (https://ocs-iecee-api.iecee.org) only allows browser requests
 * from certificates.iecee.org, so the dashboard talks to it through a relay on its own origin:
 * `public/_worker.js` in the Pages deployments, the Vite middleware in `cloudflare-spa/vite.config.ts`
 * for local preview, and `app/api/iecee/*` in the vinext build. Every relay validates the request
 * with the rules below before it leaves the site, so the upstream only ever receives the exact
 * search shape the official certificate-search front end uses. `public/_worker.js` keeps a plain
 * JavaScript copy of `sanitizeIeceeSearchBody` — change both together.
 */

export const IECEE_API_BASE = "https://ocs-iecee-api.iecee.org/api";
export const IECEE_SEARCH_UPSTREAM = `${IECEE_API_BASE}/search-es`;
export const IECEE_TRADEMARKS_UPSTREAM = `${IECEE_API_BASE}/search-trademarks`;
export const IECEE_CERTIFICATE_UPSTREAM = `${IECEE_API_BASE}/proxy/deliverables/CERT/`;

/** Elasticsearch result window on the IECEE index: `from + size` must stay at or under this. */
export const IECEE_RESULT_WINDOW = 10_000;
/** Largest page the IECEE index returns in one request. */
export const IECEE_MAX_PAGE = 1_000;
export const IECEE_MAX_QUERY_LENGTH = 200;

export const IECEE_TERM_GROUPS = ["status", "type", "scope_categories", "scopes", "org_name", "trademark.for_agg"] as const;
export const IECEE_SORT_FIELDS = ["issue_date", "ref_number", "last_update_date"] as const;
export const IECEE_DATE_FIELDS = ["issue_date"] as const;

export type IeceeTermGroup = (typeof IECEE_TERM_GROUPS)[number];
export type IeceeSortField = (typeof IECEE_SORT_FIELDS)[number];
export type IeceeDateField = (typeof IECEE_DATE_FIELDS)[number];

/** The request body the official certificate search posts to `/api/search-es`. */
export type IeceeSearchBody = {
  from: number;
  size: number;
  query: string;
  sortBy: Partial<Record<IeceeSortField, "asc" | "desc">>[];
  dateRanges: Partial<Record<IeceeDateField, { min: string | null; max: string | null }>>;
  conjunctiveFacetGroups: IeceeTermGroup[];
  terms: Partial<Record<IeceeTermGroup, Record<string, string[]>>>;
};

export type IeceeSanitizeResult = { ok: true; body: IeceeSearchBody } | { ok: false; error: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isoDay(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !ISO_DAY.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? undefined : value;
}

function cleanQuery(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return undefined;
  return value.replace(/\s+/g, " ").trim().slice(0, IECEE_MAX_QUERY_LENGTH);
}

function integer(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

/** Validates an incoming relay body and returns the exact body forwarded upstream, or a message for a 400. */
export function sanitizeIeceeSearchBody(input: unknown): IeceeSanitizeResult {
  if (!isRecord(input)) return { ok: false, error: "The IECEE search body must be a JSON object." };

  const query = cleanQuery(input.query);
  if (query === undefined) return { ok: false, error: "query must be text." };

  const from = integer(input.from, 0);
  const size = integer(input.size, 25);
  if (from === undefined || from < 0) return { ok: false, error: "from must be a whole number of results to skip." };
  if (size === undefined || size < 1 || size > IECEE_MAX_PAGE) return { ok: false, error: `size must be between 1 and ${IECEE_MAX_PAGE.toLocaleString("en-US")}.` };
  if (from + size > IECEE_RESULT_WINDOW) return { ok: false, error: `IECEE only exposes the first ${IECEE_RESULT_WINDOW.toLocaleString("en-US")} results of a search. Narrow the search instead of paging further.` };

  const sortBy: IeceeSearchBody["sortBy"] = [];
  const rawSort = input.sortBy ?? [];
  if (!Array.isArray(rawSort) || rawSort.length > 2) return { ok: false, error: "sortBy must be a list of at most two sort fields." };
  for (const entry of rawSort) {
    if (!isRecord(entry)) return { ok: false, error: "Each sortBy entry must be an object such as {\"issue_date\":\"desc\"}." };
    const keys = Object.keys(entry);
    if (keys.length !== 1) return { ok: false, error: "Each sortBy entry must name exactly one field." };
    const [field] = keys;
    const direction = entry[field];
    if (!(IECEE_SORT_FIELDS as readonly string[]).includes(field)) return { ok: false, error: `Sorting by ${field} is not supported. Use ${IECEE_SORT_FIELDS.join(", ")}.` };
    if (direction !== "asc" && direction !== "desc") return { ok: false, error: "Sort direction must be asc or desc." };
    sortBy.push({ [field]: direction } as IeceeSearchBody["sortBy"][number]);
  }

  const dateRanges: IeceeSearchBody["dateRanges"] = {};
  const rawRanges = input.dateRanges ?? {};
  if (!isRecord(rawRanges)) return { ok: false, error: "dateRanges must be an object." };
  for (const [field, range] of Object.entries(rawRanges)) {
    if (!(IECEE_DATE_FIELDS as readonly string[]).includes(field)) return { ok: false, error: `Date filtering on ${field} is not supported. Use ${IECEE_DATE_FIELDS.join(", ")}.` };
    if (range === null || range === undefined) continue;
    if (!isRecord(range)) return { ok: false, error: `dateRanges.${field} must be an object with min and max.` };
    const min = isoDay(range.min);
    const max = isoDay(range.max);
    if (min === undefined || max === undefined) return { ok: false, error: "Dates must use the YYYY-MM-DD format." };
    if (min && max && min > max) return { ok: false, error: "The date range starts after it ends." };
    if (min || max) dateRanges[field as IeceeDateField] = { min, max };
  }

  const rawConjunctive = input.conjunctiveFacetGroups ?? [];
  if (!Array.isArray(rawConjunctive)) return { ok: false, error: "conjunctiveFacetGroups must be a list." };
  const conjunctiveFacetGroups: IeceeTermGroup[] = [];
  for (const group of rawConjunctive) {
    if (typeof group !== "string" || !(IECEE_TERM_GROUPS as readonly string[]).includes(group)) return { ok: false, error: `Unknown facet group ${String(group)}.` };
    if (!conjunctiveFacetGroups.includes(group as IeceeTermGroup)) conjunctiveFacetGroups.push(group as IeceeTermGroup);
  }

  const terms: IeceeSearchBody["terms"] = {};
  const rawTerms = input.terms ?? {};
  if (!isRecord(rawTerms)) return { ok: false, error: "terms must be an object keyed by facet group." };
  let termCount = 0;
  for (const [group, levels] of Object.entries(rawTerms)) {
    if (!(IECEE_TERM_GROUPS as readonly string[]).includes(group)) return { ok: false, error: `Unknown facet group ${group}. Use ${IECEE_TERM_GROUPS.join(", ")}.` };
    if (levels === null || levels === undefined) continue;
    if (!isRecord(levels)) return { ok: false, error: `terms.${group} must map a facet level to a list of values.` };
    const cleanLevels: Record<string, string[]> = {};
    for (const [level, values] of Object.entries(levels)) {
      if (!/^[1-3]$/.test(level)) return { ok: false, error: `Facet level ${level} is not supported (use 1, 2 or 3).` };
      if (!Array.isArray(values)) return { ok: false, error: `terms.${group}.${level} must be a list of values.` };
      const cleanValues: string[] = [];
      for (const value of values) {
        if (typeof value !== "string") return { ok: false, error: `Facet values for ${group} must be text.` };
        const trimmed = value.trim().slice(0, IECEE_MAX_QUERY_LENGTH);
        if (trimmed && !cleanValues.includes(trimmed)) cleanValues.push(trimmed);
      }
      if (cleanValues.length > 50) return { ok: false, error: `At most 50 values per facet level (${group}).` };
      termCount += cleanValues.length;
      if (cleanValues.length) cleanLevels[level] = cleanValues;
    }
    if (Object.keys(cleanLevels).length) terms[group as IeceeTermGroup] = cleanLevels;
  }
  if (termCount > 200) return { ok: false, error: "Too many facet values in one search." };

  return { ok: true, body: { from, size, query, sortBy, dateRanges, conjunctiveFacetGroups, terms } };
}

/** Upstream URL for one certificate's public detail record, or null when the id is not a plain IECEE id. */
export function ieceeCertificateUpstream(id: unknown) {
  if (typeof id !== "string" || !/^\d{1,12}$/.test(id)) return null;
  return `${IECEE_CERTIFICATE_UPSTREAM}${id}`;
}

/** Cleans a trademark lookup so only a short text fragment reaches the upstream suggestion endpoint. */
export function ieceeTrademarkQuery(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/g, " ").trim().slice(0, 100);
  return cleaned.length ? cleaned : null;
}

export function ieceeTrademarkUpstream(value: unknown) {
  const query = ieceeTrademarkQuery(value);
  return query ? `${IECEE_TRADEMARKS_UPSTREAM}?q=${encodeURIComponent(query)}` : null;
}
