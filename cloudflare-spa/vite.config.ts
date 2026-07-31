import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: __dirname,
  publicDir: resolve(__dirname, "../public"),
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "../work/cloudflare-pages"),
    emptyOutDir: true,
  },
});
