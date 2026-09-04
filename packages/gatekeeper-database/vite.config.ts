import { defineConfig } from "vite-plus";
import { withVitestTask } from "@gadgets/scripts/vitest-task";
import configuratorConfig from "@gadgets/scripts/gatekeeper-configurator";

const appInput = [
  { auto: true },
  { pattern: "!**/dist-app/**", base: "workspace" as const },
  { pattern: "!**/src/generated/**", base: "workspace" as const },
  { pattern: "!**/.wrangler/**", base: "workspace" as const },
];

export default withVitestTask(
  defineConfig({
    run: {
      tasks: {
        ...configuratorConfig.run.tasks,
        "clean:error-reporting-artifacts": {
          command: "gadgets-clean-error-reporting .",
          cache: false,
        },
        "build:app": {
          command: "node build-app.mjs",
          dependsOn: ["clean:error-reporting-artifacts"],
          input: appInput,
          output: ["dist-app/**", "src/generated/app.txt"],
          env: ["VITE_FRONTEND_ERROR_REPORTING"],
        },
        "build:app:dev": {
          command: "node build-app.mjs --dev",
          dependsOn: ["clean:error-reporting-artifacts"],
          input: appInput,
          output: ["src/generated/app.txt"],
          env: ["VITE_FRONTEND_ERROR_REPORTING"],
        },
        build: {
          command: "pnpm run typecheck:app && tsc",
          dependsOn: ["build:app", "build:configurator"],
        },
      },
    },
  }),
  ["vitest run", "vitest run -c vitest.worker.config.ts"],
);
