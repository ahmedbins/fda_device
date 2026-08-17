import { FCC_EAS_API, normalizeFccScope } from "../../../fcc-core";
import { fccidIoUrl, shouldFetchFccidListPages } from "../../../fcc-index";

const RETRYABLE = new Set([502, 503, 504]);
const JINA = "https://r.jina.ai/";

async function requestFcc(fccId: string, retry = true): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetch(`${FCC_EAS_API}?fccId=${encodeURIComponent(fccId)}`, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": "Sonova-Regulatory-Data/1.0" },
    });
    if (RETRYABLE.has(response.status) && retry) return requestFcc(fccId, false);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string, headers: Record<string, string> = {}, timeoutMs = 14_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "text/plain,text/html,application/json", "user-agent": "Sonova-Regulatory-Data/1.0", ...headers },
    });
    if (!response.ok) return "";
    return await response.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFccidPages(fccId: string, includeExhibits = false) {
  const pages: string[] = [];
  const maxPages = shouldFetchFccidListPages(fccId) ? 3 : 1;
  for (let page = 1; page <= maxPages; page += 1) {
    const markdown = await fetchText(`${JINA}${fccidIoUrl(fccId, page)}`);
    if (!markdown || /Security check/i.test(markdown)) break;
    pages.push(markdown);
    const rows = markdown.match(/\*\*\[[A-Z0-9-]+\]/g) || [];
    if (!shouldFetchFccidListPages(fccId) || rows.length < 80) break;
  }
  if (includeExhibits || !shouldFetchFccidListPages(fccId)) {
    const html = await fetchText(fccidIoUrl(fccId));
    if (html && /exhibit-table|Exhibits/i.test(html) && !/Security check/i.test(html)) pages.push(html);
    const exhibitMarkdown = await fetchText(`${JINA}${fccidIoUrl(fccId)}`, { "x-target-selector": "table.exhibit-table" });
    if (exhibitMarkdown && /pdf|ID Label|Test Report|Cover Letter/i.test(exhibitMarkdown)) pages.push(exhibitMarkdown);
  }
  return pages;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fccId = normalizeFccScope(url.searchParams.get("fccId") || "");
  const exhibits = url.searchParams.get("exhibits") === "1";
  if (fccId.length < 3) return Response.json({ error: "Enter at least three FCC-ID characters or a complete grantee code." }, { status: 400 });

  if (!exhibits) {
    try {
      const response = await requestFcc(fccId);
      if (response.status === 204) return new Response(null, { status: 204, headers: { "cache-control": "public, max-age=60, s-maxage=300" } });
      if (response.ok) {
        return new Response(await response.text(), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=300", "x-fcc-source": "official" },
        });
      }
    } catch {
      // Official FCC endpoint is often blocked; fall through to the public index.
    }
  }

  const pages = await fetchFccidPages(fccId, exhibits);
  if (pages.length) {
    return Response.json({ source: "fccid.io", pages }, {
      headers: { "cache-control": "public, max-age=60, s-maxage=300", "x-fcc-source": "fccid.io" },
    });
  }
  return Response.json({ error: "The FCC Equipment Authorization source could not be reached." }, { status: 502 });
}
