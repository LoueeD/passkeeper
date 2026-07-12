import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@passkeeper/client": fileURLToPath(new URL("../../packages/client/src/index.ts", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/auth": "http://localhost:8787",
    },
  },
});
