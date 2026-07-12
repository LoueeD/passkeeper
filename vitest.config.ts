import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@passkeeper/client": new URL("./packages/client/src/index.ts", import.meta.url).pathname,
      "@passkeeper/cloudflare": new URL("./packages/cloudflare/src/index.ts", import.meta.url)
        .pathname,
      "@passkeeper/core": new URL("./packages/core/src/index.ts", import.meta.url).pathname,
      "@passkeeper/d1": new URL("./packages/d1/src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    include: ["test/**/*.test.ts", "packages/*/test/**/*.test.ts"],
  },
});
