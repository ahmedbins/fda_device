import { IECEE_SEARCH_UPSTREAM, sanitizeIeceeSearchBody } from "../../../iecee-relay";

const UPSTREAM_HEADERS = { accept: "application/json", "content-type": "application/json", "user-agent": "Sonova-Regulatory-Data/1.0" };

/**
 * Same-origin relay for the IECEE certificate search (the upstream only allows browser requests
 * from certificates.iecee.org). The body is validated so only the official search shape goes out.
 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "The IECEE search body must be JSON." }, { status: 400 });
  }
  const cleaned = sanitizeIeceeSearchBody(payload);
  if (!cleaned.ok) return Response.json({ error: cleaned.error }, { status: 400 });
  try {
    const upstream = await fetch(IECEE_SEARCH_UPSTREAM, { method: "POST", headers: UPSTREAM_HEADERS, body: JSON.stringify(cleaned.body), signal: AbortSignal.timeout(25_000) });
    const body = await upstream.text();
    if (!upstream.ok) return Response.json({ error: `The IECEE certificate search answered HTTP ${upstream.status}.` }, { status: 502 });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=300", "x-iecee-fetched-at": new Date().toISOString() },
    });
  } catch (error) {
    return Response.json({ error: `The IECEE certificate search request failed: ${error instanceof Error ? error.message : "unknown error"}` }, { status: 502 });
  }
}
