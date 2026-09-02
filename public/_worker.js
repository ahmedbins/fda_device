const FCC_API = "https://apps.fcc.gov/OETLabServices/getFCCIDList";
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/api/fcc/search") return fccSearch(request);
    if (url.pathname === "/api/gazette/source") return gazetteSource(request, ctx);
    return env.ASSETS.fetch(request);
  },
};
