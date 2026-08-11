import { FCC_EAS_API, normalizeFccScope } from "../../../fcc-core";

const RETRYABLE = new Set([502, 503, 504]);

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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fccId = normalizeFccScope(url.searchParams.get("fccId") || "");
  if (fccId.length < 3) return Response.json({ error: "Enter at least three FCC-ID characters or a complete grantee code." }, { status: 400 });

  try {
    const response = await requestFcc(fccId);
    if (response.status === 204) return new Response(null, { status: 204, headers: { "cache-control": "public, max-age=60, s-maxage=300" } });
    if (!response.ok) {
      return Response.json(
        { error: response.status === 400 ? "The FCC rejected this search. Check the FCC ID or prefix." : "The FCC Equipment Authorization source could not be reached." },
        { status: response.status === 400 ? 400 : 502 },
      );
    }
    return new Response(await response.text(), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60, s-maxage=300" },
    });
  } catch {
    return Response.json({ error: "The FCC Equipment Authorization source could not be reached." }, { status: 502 });
  }
}
