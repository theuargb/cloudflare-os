import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import capnwebValidate from "capnweb-validate/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [capnwebValidate(), cloudflareTest({
    main: "./src/worker.ts",
    miniflare: {
      compatibilityDate: "2026-09-04",
      compatibilityFlags: ["nodejs_als"],
      d1Databases: ["DATABASE"],
    },
  })],
  test: {
    include: ["__tests__/workerd/*.test.ts"],
    setupFiles: ["@gadgets/scripts/assert-workerd"],
  },
});
