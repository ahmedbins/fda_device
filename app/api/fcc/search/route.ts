import { FCC_EAS_API, normalizeFccScope } from "../../../fcc-core";
import { fccidIoUrl, shouldFetchFccidListPages } from "../../../fcc-index";

const RETRYABLE = new Set([502, 503, 504]);
const JINA = "https://r.jina.ai/";

async function requestFcc(fccId: string, retry = true): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
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

async function fetchFccidPages(fccId: string) {
  const pages: string[] = [];
  const maxPages = shouldFetchFccidListPages(fccId) ? 3 : 1;
  for (let page = 1; page <= maxPages; page += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 14_000);
    try {
      const response = await fetch(`${JINA}${fccidIoUrl(fccId, page)}`, {
        signal: controller.signal,
        headers: { accept: "text/plain", "user-agent": "Sonova-Regulatory-Data/1.0" },
      });
      if (!response.ok) break;
      const markdown = await response.text();
      if (!markdown || /Security check/i.test(markdown)) break;
      pages.push(markdown);
      const rows = markdown.match(/\*\*\[[A-Z0-9-]+\]/g) || [];
      if (!shouldFetchFccidListPages(fccId) || rows.length < 80) break;
    } catch {
      break;
    } finally {
      clearTimeout(timeout);
    }
  }
  return pages;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fccId = normalizeFccScope(url.searchParams.get("fccId") || "");
  if (fccId.length < 3) return Response.json({ error: "Enter at least three FCC-ID characters or a complete grantee code." }, { status: 400 });

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

  const pages = await fetchFccidPages(fccId);
  if (pages.length) {
    return Response.json({ source: "fccid.io", pages }, {
      headers: { "cache-control": "public, max-age=60, s-maxage=300", "x-fcc-source": "fccid.io" },
    });
  }
  return Response.json({ error: "The FCC Equipment Authorization source could not be reached." }, { status: 502 });
}
