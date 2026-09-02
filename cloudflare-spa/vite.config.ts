import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

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

export default defineConfig({
  root: __dirname,
  publicDir: resolve(__dirname, "../public"),
  plugins: [react(), cleanUrls(), gazetteProxy()],
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
        "next/index": resolve(__dirname, "next/index.html"),
        "next/fda/explorer": resolve(__dirname, "next/fda/explorer.html"),
        "next/fda/workspace": resolve(__dirname, "next/fda/workspace.html"),
        "next/gazette": resolve(__dirname, "next/gazette.html"),
      },
    },
  },
});
