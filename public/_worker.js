const FCC_API = "https://apps.fcc.gov/OETLabServices/getFCCIDList";
// Scheduled capture of the confirmed FCC scopes (cron/fcc-snapshot): the FCC blocks automated requests,
// so a Worker captures the official records twice a day and this relay serves its latest capture.
const FCC_CAPTURE_WORKER = "https://fcc-snapshot-refresh.ahmedbinsaeed1997.workers.dev";
const JINA = "https://r.jina.ai/";
const FCCID_IO = "https://fccid.io";

function cleanFccId(value) {
  return value.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "").slice(0, 19);
}

function isGranteeOnly(fccId) {
  if (/^[A-Z]/.test(fccId)) return fccId.length === 3;
  if (/^[2-9]/.test(fccId)) return fccId.length === 5;
  return false;
}

async function fetchFcc(fccId, retry = true) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${FCC_API}?fccId=${encodeURIComponent(fccId)}`, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "Sonova-Regulatory-Data/1.0" },
    });
    if (retry && [502, 503, 504].includes(response.status)) return fetchFcc(fccId, false);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, extraHeaders = {}, timeoutMs = 14000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "text/plain,text/html,application/json", "user-agent": "Sonova-Regulatory-Data/1.0", ...extraHeaders },
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFccidIndex(fccId, includeExhibits = false) {
  const pages = [];
  const maxPages = isGranteeOnly(fccId) ? 3 : 1;
  for (let page = 1; page <= maxPages; page += 1) {
    const target = page === 1 ? `${FCCID_IO}/${encodeURIComponent(fccId)}` : `${FCCID_IO}/${encodeURIComponent(fccId)}?page=${page}`;
    const markdown = await fetchText(`${JINA}${target}`);
    if (!markdown || /Security check/i.test(markdown)) break;
    pages.push(markdown);
    const rows = markdown.match(/\*\*\[[A-Z0-9-]+\]/g) || [];
    if (!isGranteeOnly(fccId) || rows.length < 80) break;
  }
  if (includeExhibits || !isGranteeOnly(fccId)) {
    const html = await fetchText(`${FCCID_IO}/${encodeURIComponent(fccId)}`);
    if (html && /exhibit-table|Exhibits/i.test(html) && !/Security check/i.test(html)) pages.push(html);
    const exhibitMarkdown = await fetchText(`${JINA}${FCCID_IO}/${encodeURIComponent(fccId)}`, { "x-target-selector": "table.exhibit-table" });
    if (exhibitMarkdown && /pdf|ID Label|Test Report|Cover Letter/i.test(exhibitMarkdown)) pages.push(exhibitMarkdown);
  }
  return pages;
}

async function fccCurrent(ctx) {
  const target = `${FCC_CAPTURE_WORKER}/snapshot`;
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const cacheKey = new Request(target, { method: "GET" });
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const hit = new Response(cached.body, cached);
      hit.headers.set("x-fcc-capture-cache", "HIT");
      return hit;
    }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch(target, { signal: controller.signal, headers: { accept: "application/json", "user-agent": "Sonova-Regulatory-Data/1.0" } });
    const body = await upstream.text();
    if (!upstream.ok) return Response.json({ error: `The FCC capture service answered HTTP ${upstream.status}.` }, { status: upstream.status === 404 ? 404 : 502 });
    const response = new Response(body, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=600", "x-fcc-capture-cache": "MISS" },
    });
    if (cache && ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    return Response.json({ error: `The FCC capture service could not be reached: ${error instanceof Error ? error.message : "unknown error"}` }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

async function fccSearch(request) {
  const url = new URL(request.url);
  const fccId = cleanFccId(url.searchParams.get("fccId") || "");
  const exhibits = url.searchParams.get("exhibits") === "1";
  if (fccId.length < 3) return Response.json({ error: "Enter at least three FCC-ID characters or a complete grantee code." }, { status: 400 });
  if (!exhibits) {
    try {
      const response = await fetchFcc(fccId);
      if (response.status === 204) return new Response(null, { status: 204 });
      if (response.ok) {
        return new Response(await response.text(), {
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=300", "x-fcc-source": "official" },
        });
      }
    } catch {
      // Official FCC endpoint is often blocked; fall through to the public index.
    }
  }
  const pages = await fetchFccidIndex(fccId, exhibits);
  if (pages.length) {
    return Response.json({ source: "fccid.io", pages }, {
      headers: { "cache-control": "public, max-age=60, s-maxage=300", "x-fcc-source": "fccid.io" },
    });
  }
  return Response.json({ error: "The FCC Equipment Authorization source could not be reached." }, { status: 502 });
}

const GAZETTE_HOSTS = new Set(["gazette.gc.ca", "www.gazette.gc.ca", "canadagazette.gc.ca", "www.canadagazette.gc.ca"]);

// Same-origin proxy for official Canada Gazette pages: the Gazette site refuses cross-origin
// browser requests, so the page asks this worker, which fetches, caches and relays the HTML.
async function gazetteSource(request, ctx) {
  const target = new URL(request.url).searchParams.get("url") || "";
  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Missing or invalid url", { status: 400 });
  }
  if (parsed.protocol !== "https:" || !GAZETTE_HOSTS.has(parsed.hostname)) return new Response("Only gazette.gc.ca pages can be relayed", { status: 400 });
  const cache = caches.default;
  const cacheKey = new Request(parsed.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const hit = new Response(cached.body, cached);
    hit.headers.set("x-gazette-cache", "HIT");
    return hit;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const upstream = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 (compatible; Sonova-Regulatory-Data/1.0)" },
    });
    if (!upstream.ok) return new Response(`Canada Gazette answered HTTP ${upstream.status}`, { status: upstream.status === 404 ? 404 : 502 });
    const body = await upstream.arrayBuffer();
    const ttl = /index-eng\.html$/.test(parsed.pathname) ? 1800 : 86400;
    const response = new Response(body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "text/html; charset=utf-8",
        "cache-control": `public, max-age=${ttl}`,
        "x-gazette-fetched-at": new Date().toISOString(),
        "x-gazette-cache": "MISS",
      },
    });
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    return new Response(`Canada Gazette request failed: ${error instanceof Error ? error.message : "unknown error"}`, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------------------------
// IECEE CB Scheme certificate search relay.
// The IECEE certificate API (https://ocs-iecee-api.iecee.org) only allows browser requests from
// certificates.iecee.org, so the dashboard calls this same-origin relay instead. The relay validates
// every search body against the official front end's request shape (a plain-JS copy of
// `sanitizeIeceeSearchBody` in app/iecee-relay.ts — keep both in sync), forwards it, strips upstream
// cookies, and caches answers at the edge (searches 5 minutes, certificate records 6 hours).
// ---------------------------------------------------------------------------------------------
const IECEE_API = "https://ocs-iecee-api.iecee.org/api";
const IECEE_TERM_GROUPS = ["status", "type", "scope_categories", "scopes", "org_name", "trademark.for_agg"];
const IECEE_SORT_FIELDS = ["issue_date", "ref_number", "last_update_date"];
const IECEE_DATE_FIELDS = ["issue_date"];
const IECEE_RESULT_WINDOW = 10000;
const IECEE_MAX_PAGE = 1000;
const IECEE_HEADERS = { accept: "application/json", "user-agent": "Sonova-Regulatory-Data/1.0" };

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function ieceeDay(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? undefined : value;
}

function ieceeInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function sanitizeIeceeBody(input) {
  if (!isRecord(input)) return { error: "The IECEE search body must be a JSON object." };
  const rawQuery = input.query === undefined || input.query === null ? "" : input.query;
  if (typeof rawQuery !== "string") return { error: "query must be text." };
  const query = rawQuery.replace(/\s+/g, " ").trim().slice(0, 200);
  const from = ieceeInteger(input.from, 0);
  const size = ieceeInteger(input.size, 25);
  if (from === undefined || from < 0) return { error: "from must be a whole number of results to skip." };
  if (size === undefined || size < 1 || size > IECEE_MAX_PAGE) return { error: `size must be between 1 and ${IECEE_MAX_PAGE}.` };
  if (from + size > IECEE_RESULT_WINDOW) return { error: "IECEE only exposes the first 10,000 results of a search. Narrow the search instead of paging further." };
  const rawSort = input.sortBy ?? [];
  if (!Array.isArray(rawSort) || rawSort.length > 2) return { error: "sortBy must be a list of at most two sort fields." };
  const sortBy = [];
  for (const entry of rawSort) {
    if (!isRecord(entry) || Object.keys(entry).length !== 1) return { error: "Each sortBy entry must name exactly one field." };
    const [field] = Object.keys(entry);
    if (!IECEE_SORT_FIELDS.includes(field)) return { error: `Sorting by ${field} is not supported.` };
    if (entry[field] !== "asc" && entry[field] !== "desc") return { error: "Sort direction must be asc or desc." };
    sortBy.push({ [field]: entry[field] });
  }
  const rawRanges = input.dateRanges ?? {};
  if (!isRecord(rawRanges)) return { error: "dateRanges must be an object." };
  const dateRanges = {};
  for (const [field, range] of Object.entries(rawRanges)) {
    if (!IECEE_DATE_FIELDS.includes(field)) return { error: `Date filtering on ${field} is not supported.` };
    if (range === null || range === undefined) continue;
    if (!isRecord(range)) return { error: `dateRanges.${field} must be an object with min and max.` };
    const min = ieceeDay(range.min);
    const max = ieceeDay(range.max);
    if (min === undefined || max === undefined) return { error: "Dates must use the YYYY-MM-DD format." };
    if (min && max && min > max) return { error: "The date range starts after it ends." };
    if (min || max) dateRanges[field] = { min, max };
  }
  const rawConjunctive = input.conjunctiveFacetGroups ?? [];
  if (!Array.isArray(rawConjunctive)) return { error: "conjunctiveFacetGroups must be a list." };
  const conjunctiveFacetGroups = [];
  for (const group of rawConjunctive) {
    if (typeof group !== "string" || !IECEE_TERM_GROUPS.includes(group)) return { error: `Unknown facet group ${String(group)}.` };
    if (!conjunctiveFacetGroups.includes(group)) conjunctiveFacetGroups.push(group);
  }
  const rawTerms = input.terms ?? {};
  if (!isRecord(rawTerms)) return { error: "terms must be an object keyed by facet group." };
  const terms = {};
  let termCount = 0;
  for (const [group, levels] of Object.entries(rawTerms)) {
    if (!IECEE_TERM_GROUPS.includes(group)) return { error: `Unknown facet group ${group}.` };
    if (levels === null || levels === undefined) continue;
    if (!isRecord(levels)) return { error: `terms.${group} must map a facet level to a list of values.` };
    const cleanLevels = {};
    for (const [level, values] of Object.entries(levels)) {
      if (!/^[1-3]$/.test(level)) return { error: `Facet level ${level} is not supported (use 1, 2 or 3).` };
      if (!Array.isArray(values)) return { error: `terms.${group}.${level} must be a list of values.` };
      const cleanValues = [];
      for (const value of values) {
        if (typeof value !== "string") return { error: `Facet values for ${group} must be text.` };
        const trimmed = value.trim().slice(0, 200);
        if (trimmed && !cleanValues.includes(trimmed)) cleanValues.push(trimmed);
      }
      if (cleanValues.length > 50) return { error: `At most 50 values per facet level (${group}).` };
      termCount += cleanValues.length;
      if (cleanValues.length) cleanLevels[level] = cleanValues;
    }
    if (Object.keys(cleanLevels).length) terms[group] = cleanLevels;
  }
  if (termCount > 200) return { error: "Too many facet values in one search." };
  return { body: { from, size, query, sortBy, dateRanges, conjunctiveFacetGroups, terms } };
}

async function ieceeCacheKey(kind, value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return new Request(`https://iecee-relay.internal/${kind}/${hash}`, { method: "GET" });
}

async function ieceeRelay(ctx, kind, cacheValue, ttl, upstream) {
  const cache = caches.default;
  const cacheKey = await ieceeCacheKey(kind, cacheValue);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const hit = new Response(cached.body, cached);
    hit.headers.set("x-iecee-cache", "HIT");
    return hit;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(upstream.url, { ...upstream.init, signal: controller.signal });
    if (response.status === 404) return Response.json({ error: "IECEE has no public record for that certificate id." }, { status: 404 });
    const body = await response.text();
    if (!response.ok) return Response.json({ error: `The IECEE certificate service answered HTTP ${response.status}.` }, { status: 502 });
    const relayed = new Response(body, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": `public, max-age=${ttl}`,
        "x-iecee-fetched-at": new Date().toISOString(),
        "x-iecee-cache": "MISS",
      },
    });
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(cache.put(cacheKey, relayed.clone()));
    return relayed;
  } catch (error) {
    return Response.json({ error: `The IECEE certificate request failed: ${error instanceof Error ? error.message : "unknown error"}` }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

async function ieceeSearch(request, ctx) {
  if (request.method !== "POST") return Response.json({ error: "Use POST with a JSON search body." }, { status: 405, headers: { allow: "POST" } });
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "The IECEE search body must be JSON." }, { status: 400 });
  }
  const cleaned = sanitizeIeceeBody(payload);
  if (cleaned.error) return Response.json({ error: cleaned.error }, { status: 400 });
  const body = JSON.stringify(cleaned.body);
  return ieceeRelay(ctx, "search", body, 300, { url: `${IECEE_API}/search-es`, init: { method: "POST", headers: { ...IECEE_HEADERS, "content-type": "application/json" }, body } });
}

async function ieceeCertificate(request, ctx) {
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^\d{1,12}$/.test(id)) return Response.json({ error: "id must be a numeric IECEE certificate id." }, { status: 400 });
  return ieceeRelay(ctx, "certificate", id, 21600, { url: `${IECEE_API}/proxy/deliverables/CERT/${id}`, init: { headers: IECEE_HEADERS } });
}

async function ieceeTrademarks(request, ctx) {
  const query = (new URL(request.url).searchParams.get("q") || "").replace(/\s+/g, " ").trim().slice(0, 100);
  if (!query) return Response.json({ error: "q must be a short trademark fragment." }, { status: 400 });
  return ieceeRelay(ctx, "trademarks", query.toLowerCase(), 3600, { url: `${IECEE_API}/search-trademarks?q=${encodeURIComponent(query)}`, init: { headers: IECEE_HEADERS } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/fcc/search") return fccSearch(request);
    if (url.pathname === "/api/fcc/current") return fccCurrent(ctx);
    if (url.pathname === "/api/gazette/source") return gazetteSource(request, ctx);
    if (url.pathname === "/api/iecee/search") return ieceeSearch(request, ctx);
    if (url.pathname === "/api/iecee/certificate") return ieceeCertificate(request, ctx);
    if (url.pathname === "/api/iecee/trademarks") return ieceeTrademarks(request, ctx);
    return env.ASSETS.fetch(request);
  },
};
