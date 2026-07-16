import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    cloudflare({
      configPath: mode === "production" ? "./wrangler.jsonc" : "./wrangler.local.jsonc",
      inspectorPort: mode === "e2e" ? 9330 : undefined,
      persistState: mode === "e2e" ? { path: ".wrangler/e2e" } : true,
    }),
  ],
}));
