import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { IECEE_SEARCH_UPSTREAM, ieceeCertificateUpstream, ieceeTrademarkUpstream, sanitizeIeceeSearchBody } from "../app/iecee-relay";

// Cloudflare Pages serves extensionless HTML routes in production; mirror that locally.
function cleanUrls(): Plugin {
  const routeFiles = new Map([
    ["/monitor", "/monitor.html"],
    ["/fda/explorer", "/fda/explorer.html"],
    ["/fda/monitoring", "/fda/monitoring.html"],
    ["/fcc/explorer", "/fcc/explorer.html"],
    ["/fcc/monitoring", "/fcc/monitoring.html"],
    ["/hc/explorer", "/hc/explorer.html"],
    ["/hc/monitoring", "/hc/monitoring.html"],
    ["/iecee/explorer", "/iecee/explorer.html"],
    ["/iecee/monitoring", "/iecee/monitoring.html"],
    ["/next", "/next/index.html"],
    ["/next/", "/next/index.html"],
    ["/next/fda/explorer", "/next/fda/explorer.html"],
    ["/next/fda/workspace", "/next/fda/workspace.html"],
    ["/next/gazette", "/next/gazette.html"],
  ]);
  const rewrite = (url?: string) => {
    if (!url) return url;
    const [pathname, query] = url.split("?");
    const target = routeFiles.get(pathname);
    return target ? `${target}${query ? `?${query}` : ""}` : url;
  };
  return {
    name: "clean-urls",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = rewrite(req.url) ?? req.url;
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        req.url = rewrite(req.url) ?? req.url;
        next();
      });
    },
  };
}

// Local stand-in for the Pages worker's /api/gazette/source relay (see public/_worker.js).
function gazetteProxy(): Plugin {
  const hosts = new Set(["gazette.gc.ca", "www.gazette.gc.ca", "canadagazette.gc.ca", "www.canadagazette.gc.ca"]);
  const handle = async (req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (body?: string | Buffer) => void }, next: () => void) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== "/api/gazette/source") return next();
    let target: URL;
    try {
      target = new URL(url.searchParams.get("url") || "");
    } catch {
      res.statusCode = 400;
      return res.end("Missing or invalid url");
    }
    if (target.protocol !== "https:" || !hosts.has(target.hostname)) {
      res.statusCode = 400;
      return res.end("Only gazette.gc.ca pages can be relayed");
    }
    try {
      const upstream = await fetch(target.toString(), { headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (compatible; Sonova-Regulatory-Data/1.0)" } });
      res.statusCode = upstream.ok ? 200 : upstream.status === 404 ? 404 : 502;
      res.setHeader("content-type", upstream.headers.get("content-type") || "text/html; charset=utf-8");
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      res.statusCode = 502;
      res.end(`Canada Gazette request failed: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  };
  return {
    name: "gazette-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next));
    },
  };
}

// Local stand-in for the Pages worker's IECEE relay (see public/_worker.js): the IECEE certificate API only
// allows browser requests from certificates.iecee.org, so the page posts to this same-origin route instead.
function ieceeProxy(): Plugin {
  type Req = { url?: string; method?: string; on: (event: string, handler: (chunk?: Buffer | string) => void) => void };
  type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (body?: string | Buffer) => void };
  const json = (res: Res, status: number, payload: unknown) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  };
  const readBody = (req: Req) => new Promise<string>((resolvePromise, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += String(chunk);
      if (data.length > 64_000) reject(new Error("The IECEE search body is too large."));
    });
    req.on("end", () => resolvePromise(data));
    req.on("error", (error) => reject(error));
  });
  const relay = async (res: Res, target: string, init: RequestInit, ttl: number) => {
    try {
      const upstream = await fetch(target, { ...init, headers: { accept: "application/json", "user-agent": "Sonova-Regulatory-Data/1.0", ...(init.headers as Record<string, string> | undefined) }, signal: AbortSignal.timeout(25_000) });
      if (upstream.status === 404) return json(res, 404, { error: "IECEE has no public record for that certificate id." });
      const body = await upstream.text();
      if (!upstream.ok) return json(res, 502, { error: `The IECEE certificate service answered HTTP ${upstream.status}.` });
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("cache-control", `public, max-age=${ttl}`);
      res.setHeader("x-iecee-fetched-at", new Date().toISOString());
      res.end(body);
    } catch (error) {
      json(res, 502, { error: `The IECEE certificate request failed: ${error instanceof Error ? error.message : "unknown error"}` });
    }
  };
  const handle = async (req: Req, res: Res, next: () => void) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname === "/api/iecee/search") {
      if (req.method !== "POST") return json(res, 405, { error: "Use POST with a JSON search body." });
      let payload: unknown;
      try {
        payload = JSON.parse(await readBody(req) || "{}");
      } catch {
        return json(res, 400, { error: "The IECEE search body must be JSON." });
      }
      const cleaned = sanitizeIeceeSearchBody(payload);
      if (!cleaned.ok) return json(res, 400, { error: cleaned.error });
      return relay(res, IECEE_SEARCH_UPSTREAM, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cleaned.body) }, 300);
    }
    if (url.pathname === "/api/iecee/certificate") {
      const target = ieceeCertificateUpstream(url.searchParams.get("id") || "");
      if (!target) return json(res, 400, { error: "id must be a numeric IECEE certificate id." });
      return relay(res, target, {}, 21_600);
    }
    if (url.pathname === "/api/iecee/trademarks") {
      const target = ieceeTrademarkUpstream(url.searchParams.get("q") || "");
      if (!target) return json(res, 400, { error: "q must be a short trademark fragment." });
      return relay(res, target, {}, 3_600);
    }
    return next();
  };
  return {
    name: "iecee-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handle(req as unknown as Req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handle(req as unknown as Req, res, next));
    },
  };
}

export default defineConfig({
  root: __dirname,
  publicDir: resolve(__dirname, "../public"),
  plugins: [react(), cleanUrls(), gazetteProxy(), ieceeProxy()],
  build: {
    outDir: resolve(__dirname, "../work/cloudflare-pages"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        monitor: resolve(__dirname, "monitor.html"),
        "fda/explorer": resolve(__dirname, "fda/explorer.html"),
        "fda/monitoring": resolve(__dirname, "fda/monitoring.html"),
        "fcc/explorer": resolve(__dirname, "fcc/explorer.html"),
        "fcc/monitoring": resolve(__dirname, "fcc/monitoring.html"),
        "hc/explorer": resolve(__dirname, "hc/explorer.html"),
        "hc/monitoring": resolve(__dirname, "hc/monitoring.html"),
        "iecee/explorer": resolve(__dirname, "iecee/explorer.html"),
        "iecee/monitoring": resolve(__dirname, "iecee/monitoring.html"),
        "next/index": resolve(__dirname, "next/index.html"),
        "next/fda/explorer": resolve(__dirname, "next/fda/explorer.html"),
        "next/fda/workspace": resolve(__dirname, "next/fda/workspace.html"),
        "next/gazette": resolve(__dirname, "next/gazette.html"),
      },
    },
  },
});
