const FCC_API = "https://apps.fcc.gov/OETLabServices/getFCCIDList";

function cleanFccId(value) {
  return value.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "").slice(0, 19);
}

async function fetchFcc(fccId, retry = true) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
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

async function fccSearch(request) {
  const fccId = cleanFccId(new URL(request.url).searchParams.get("fccId") || "");
  if (fccId.length < 3) return Response.json({ error: "Enter at least three FCC-ID characters or a complete grantee code." }, { status: 400 });
  try {
    const response = await fetchFcc(fccId);
    if (response.status === 204) return new Response(null, { status: 204 });
    if (!response.ok) {
      return Response.json({ error: response.status === 400 ? "The FCC rejected this search. Check the FCC ID or prefix." : "The FCC Equipment Authorization source could not be reached." }, { status: response.status === 400 ? 400 : 502 });
    }
    return new Response(await response.text(), {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=300" },
    });
  } catch {
    return Response.json({ error: "The FCC Equipment Authorization source could not be reached." }, { status: 502 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/fcc/search") return fccSearch(request);
    return env.ASSETS.fetch(request);
  },
};
