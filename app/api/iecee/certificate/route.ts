import { ieceeCertificateUpstream } from "../../../iecee-relay";

/** Relays one certificate's public detail record (`/api/proxy/deliverables/CERT/{id}` upstream). */
export async function GET(request: Request) {
  const target = ieceeCertificateUpstream(new URL(request.url).searchParams.get("id") || "");
  if (!target) return Response.json({ error: "id must be a numeric IECEE certificate id." }, { status: 400 });
  try {
    const upstream = await fetch(target, { headers: { accept: "application/json", "user-agent": "Sonova-Regulatory-Data/1.0" }, signal: AbortSignal.timeout(20_000) });
    if (upstream.status === 404) return Response.json({ error: "IECEE has no public record for that certificate id." }, { status: 404 });
    const body = await upstream.text();
    if (!upstream.ok) return Response.json({ error: `The IECEE certificate record answered HTTP ${upstream.status}.` }, { status: 502 });
    return new Response(body, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=21600" } });
  } catch (error) {
    return Response.json({ error: `The IECEE certificate record request failed: ${error instanceof Error ? error.message : "unknown error"}` }, { status: 502 });
  }
}
