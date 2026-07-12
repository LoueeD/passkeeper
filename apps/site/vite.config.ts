import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  plugins: [
    cloudflare({
      configPath: mode === "staging" ? "./wrangler.staging.jsonc" : "./wrangler.jsonc",
      persistState: mode === "e2e" ? { path: ".wrangler/e2e" } : true,
    }),
  ],
}));
