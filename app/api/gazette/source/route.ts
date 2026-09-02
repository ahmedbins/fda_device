import { isGazetteUrl } from "../../../gazette-core";

/** Server-side relay for official Canada Gazette pages (the Gazette site refuses cross-origin browser requests). */
export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url") || "";
  if (!isGazetteUrl(target)) return new Response("Only https://gazette.gc.ca pages can be relayed", { status: 400 });
  try {
    const upstream = await fetch(target, { headers: { accept: "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 (compatible; Sonova-Regulatory-Data/1.0)" } });
    if (!upstream.ok) return new Response(`Canada Gazette answered HTTP ${upstream.status}`, { status: upstream.status === 404 ? 404 : 502 });
    return new Response(await upstream.arrayBuffer(), {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "text/html; charset=utf-8",
        "cache-control": /index-eng\.html$/.test(new URL(target).pathname) ? "public, max-age=1800" : "public, max-age=86400",
      },
    });
  } catch (error) {
    return new Response(`Canada Gazette request failed: ${error instanceof Error ? error.message : "unknown error"}`, { status: 502 });
  }
}
