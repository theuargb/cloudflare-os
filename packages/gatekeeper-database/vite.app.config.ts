import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import tsconfigPaths from "vite-tsconfig-paths";

const directory = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");
const unminified = watch || process.env.GATEKEEPER_APP_UNMINIFIED === "true";
function emitApp(errorReporting: boolean): Plugin {
  return {
    name: "emit-database-app",
    closeBundle() {
      let html = readFileSync(
        resolve(directory, "dist-app/app/index.html"),
        "utf8",
      ).replace(
        /(<script type="module"[^>]*>)([\s\S]*?)(<\/script>)/,
        "$1$2\n//# sourceURL=app:///gatekeeper/database/gatekeeper-database.js\n$3",
      );
      let script = html.match(
        /<script type="module"[^>]*>([\s\S]*?)<\/script>/,
      )?.[1];
      if (script && errorReporting)
        writeFileSync(
          resolve(directory, "dist-app/gatekeeper-database.js"),
          `${script}\n//# sourceMappingURL=gatekeeper-database.js.map\n`,
        );
      let output = resolve(directory, "src/generated/app.txt");
      let contents =
        "<!-- Generated from packages/gatekeeper-database/app. Do not edit. -->\n" +
        html;
      if (existsSync(output) && readFileSync(output, "utf8") === contents)
        return;
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, contents);
    },
  };
}

export default defineConfig(({ mode }) => {
  let errorReporting =
    loadEnv(mode, directory).VITE_FRONTEND_ERROR_REPORTING === "true";
  return {
    plugins: [
      react(),
      tailwindcss(),
      tsconfigPaths(),
      viteSingleFile(),
      emitApp(errorReporting),
    ],
    build: {
      outDir: "dist-app",
      emptyOutDir: true,
      minify: unminified ? false : "terser",
      terserOptions: { compress: { passes: 2 }, format: { comments: false } },
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
      sourcemap: errorReporting ? "hidden" : false,
      rollupOptions: {
        input: "app/index.html",
        output: { entryFileNames: "gatekeeper-database.js" },
      },
      watch: watch
        ? {
            exclude: [
              "**/node_modules/**",
              "**/dist-app/**",
              "**/.wrangler/**",
              "**/generated/**",
            ],
          }
        : undefined,
    },
  };
});
