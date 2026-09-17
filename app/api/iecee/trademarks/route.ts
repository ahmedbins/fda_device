import { ieceeTrademarkUpstream } from "../../../iecee-relay";

/** Relays the official trademark suggestion lookup (`/api/search-trademarks?q=` upstream). */
export async function GET(request: Request) {
  const target = ieceeTrademarkUpstream(new URL(request.url).searchParams.get("q") || "");
  if (!target) return Response.json({ error: "q must be a short trademark fragment." }, { status: 400 });
  try {
    const upstream = await fetch(target, { headers: { accept: "application/json", "user-agent": "Sonova-Regulatory-Data/1.0" }, signal: AbortSignal.timeout(15_000) });
    const body = await upstream.text();
    if (!upstream.ok) return Response.json({ error: `The IECEE trademark lookup answered HTTP ${upstream.status}.` }, { status: 502 });
    return new Response(body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600" } });
  } catch (error) {
    return Response.json({ error: `The IECEE trademark lookup failed: ${error instanceof Error ? error.message : "unknown error"}` }, { status: 502 });
  }
}
