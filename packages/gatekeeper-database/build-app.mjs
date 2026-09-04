import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBinEntry } from "@gadgets/scripts/bin-entry";
import { pnpmCommand } from "@gadgets/scripts/pnpm-command";

const directory = resolve(fileURLToPath(import.meta.url), "..");
const watch = process.argv.includes("--watch");
const dev = process.argv.includes("--dev");
const entry = resolveBinEntry(directory, "vite");
const viteArgs = [
  "build",
  "-c",
  "vite.app.config.ts",
  ...(watch ? ["--watch"] : []),
];
const [command, argv] = entry
  ? [process.execPath, [entry, ...viteArgs]]
  : pnpmCommand(["exec", "vite", ...viteArgs]);
execFileSync(command, argv, {
  cwd: directory,
  stdio: "inherit",
  env: { ...process.env, GATEKEEPER_APP_UNMINIFIED: dev ? "true" : "false" },
});
