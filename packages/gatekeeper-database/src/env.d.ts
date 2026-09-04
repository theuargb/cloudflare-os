declare namespace Cloudflare {
  interface Env {
    DATABASE: D1Database;
  }

  interface GlobalProps {
    mainModule: typeof import("./worker.js");
    durableNamespaces: "DatabaseDataGatekeeper" | "DatabaseSchemaGatekeeper";
  }
}
