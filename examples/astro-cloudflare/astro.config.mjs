import cloudflare from "@astrojs/cloudflare";
import { fileURLToPath } from "node:url";
import { defineConfig } from "astro/config";

export default defineConfig({
  adapter: cloudflare(),
  output: "server",
  vite: {
    resolve: {
      alias: {
        "@passkeeper/client": fileURLToPath(new URL("../../packages/client/src/index.ts", import.meta.url)),
        "@passkeeper/cloudflare": fileURLToPath(
          new URL("../../packages/cloudflare/src/index.ts", import.meta.url),
        ),
        "@passkeeper/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
        "@passkeeper/d1": fileURLToPath(new URL("../../packages/d1/src/index.ts", import.meta.url)),
      },
    },
  },
});
