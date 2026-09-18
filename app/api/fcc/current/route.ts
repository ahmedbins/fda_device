import { FCC_CAPTURE_WORKER } from "../../../fcc-capture";

/** Relays the latest scheduled FCC capture (cron/fcc-snapshot) for the full-stack build. */
export async function GET() {
  try {
    const upstream = await fetch(`${FCC_CAPTURE_WORKER}/snapshot`, { headers: { accept: "application/json", "user-agent": "Sonova-Regulatory-Data/1.0" }, signal: AbortSignal.timeout(15_000) });
    const body = await upstream.text();
    if (!upstream.ok) return Response.json({ error: `The FCC capture service answered HTTP ${upstream.status}.` }, { status: upstream.status === 404 ? 404 : 502 });
    return new Response(body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=600" } });
  } catch (error) {
    return Response.json({ error: `The FCC capture service could not be reached: ${error instanceof Error ? error.message : "unknown error"}` }, { status: 502 });
  }
}
