import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Cloudflare Pages serves /monitor for monitor.html in production; mirror that locally.
function cleanUrls(): Plugin {
  const rewrite = (url?: string) =>
    url && url.split("?")[0] === "/monitor" ? url.replace("/monitor", "/monitor.html") : url;
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
      },
    },
  },
});
