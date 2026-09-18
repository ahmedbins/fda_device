/**
 * fcc-snapshot-refresh — a scheduled Cloudflare Worker that keeps the FCC equipment-authorization
 * records for the confirmed Sonova scopes current. It runs daily (see wrangler.toml), stores each
 * capture in KV with its provenance, and serves the latest capture to the dashboard.
 *
 *   GET  /snapshot   full latest capture per scope (records included)
 *   GET  /latest     last run summary (sources, counts, what changed)
 *   GET  /history    the last 30 run summaries
 *   POST /refresh    run a refresh now (at most once per 10 minutes)
 */
import {
  REFRESH_COOLDOWN_MS,
  appendHistory,
  captureScope,
  parseScopes,
  summarizeScope,
  type RefreshSummary,
  type ScopeCapture,
} from "./refresh-core";

/** The slice of Cloudflare's bindings this Worker uses, typed locally so the repo's tsc run needs no extra packages. */
type KvLike = { get<T>(key: string, type: "json"): Promise<T | null>; put(key: string, value: string): Promise<void> };
type Ctx = { waitUntil(promise: Promise<unknown>): void };

export interface Env {
  FCC_SNAPSHOT: KvLike;
  FCC_SCOPES?: string;
}

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" };

function json(payload: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS, ...extra } });
}

async function readJson<T>(env: Env, key: string): Promise<T | null> {
  return env.FCC_SNAPSHOT.get<T>(key, "json");
}

export async function runRefresh(env: Env, trigger: RefreshSummary["trigger"]): Promise<RefreshSummary> {
  const scopes = parseScopes(env.FCC_SCOPES);
  const summary: RefreshSummary = { refreshedAt: new Date().toISOString(), trigger, scopes: {} };
  for (const scope of scopes) {
    const previous = await readJson<ScopeCapture>(env, `scope:${scope}`);
    const outcome = await captureScope(scope, fetch);
    summary.scopes[scope] = summarizeScope(previous, outcome);
    if ("error" in outcome) {
      await env.FCC_SNAPSHOT.put(`scope:${scope}:failure`, JSON.stringify(outcome));
    } else {
      if (previous) await env.FCC_SNAPSHOT.put(`scope:${scope}:previous`, JSON.stringify(previous));
      await env.FCC_SNAPSHOT.put(`scope:${scope}`, JSON.stringify(outcome));
    }
  }
  await env.FCC_SNAPSHOT.put("latest", JSON.stringify(summary));
  await env.FCC_SNAPSHOT.put("history", JSON.stringify(appendHistory(await readJson<RefreshSummary[]>(env, "history"), summary)));
  return summary;
}

const worker = {
  async scheduled(_event: unknown, env: Env, ctx: Ctx) {
    ctx.waitUntil(runRefresh(env, "cron"));
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (url.pathname === "/latest" && request.method === "GET") {
      const latest = await readJson<RefreshSummary>(env, "latest");
      return latest ? json(latest, 200, { "cache-control": "public, max-age=300" }) : json({ error: "No refresh has run yet." }, 404);
    }

    if (url.pathname === "/history" && request.method === "GET") {
      return json((await readJson<RefreshSummary[]>(env, "history")) || [], 200, { "cache-control": "public, max-age=300" });
    }

    if (url.pathname === "/snapshot" && request.method === "GET") {
      const latest = await readJson<RefreshSummary>(env, "latest");
      if (!latest) return json({ error: "No refresh has run yet." }, 404);
      const scopes: Record<string, ScopeCapture> = {};
      for (const scope of parseScopes(env.FCC_SCOPES)) {
        const capture = await readJson<ScopeCapture>(env, `scope:${scope}`);
        if (capture) scopes[scope] = capture;
      }
      return json({ refreshedAt: latest.refreshedAt, trigger: latest.trigger, summary: latest.scopes, scopes }, 200, { "cache-control": "public, max-age=600" });
    }

    if (url.pathname === "/refresh" && request.method === "POST") {
      const latest = await readJson<RefreshSummary>(env, "latest");
      const elapsed = latest ? Date.now() - new Date(latest.refreshedAt).getTime() : Number.POSITIVE_INFINITY;
      if (elapsed < REFRESH_COOLDOWN_MS && url.searchParams.get("force") !== "1") return json({ ...latest, skipped: true, retryAfterSeconds: Math.ceil((REFRESH_COOLDOWN_MS - elapsed) / 1000) }, 429, { "retry-after": String(Math.ceil((REFRESH_COOLDOWN_MS - elapsed) / 1000)) });
      return json(await runRefresh(env, "manual"), 200, { "cache-control": "no-store" });
    }

    if (url.pathname === "/" || url.pathname === "/health") return json({ ok: true, worker: "fcc-snapshot-refresh", routes: ["/snapshot", "/latest", "/history", "POST /refresh"] });
    return json({ error: "Not found" }, 404);
  },
};

export default worker;
