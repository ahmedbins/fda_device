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

export default defineConfig({
  root: __dirname,
  publicDir: resolve(__dirname, "../public"),
  plugins: [react(), cleanUrls()],
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
      },
    },
  },
});
