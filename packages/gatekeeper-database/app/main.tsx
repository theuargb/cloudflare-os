import { createRoot } from "react-dom/client";
import { Toasty, TooltipProvider } from "@cloudflare/kumo";
import { newMessagePortRpcSession, RpcTarget, type RpcStub } from "capnweb";
import type {
  GatekeeperAppTheme,
  GatekeeperAppThemeReceiver,
} from "@gadgets/workshop-shared/theme";
import type { DatabaseManagementApi } from "../src/management-types";
import DatabasePage from "./page";
import ErrorBoundary from "./ErrorBoundary";
import { installErrorReporting, reportIssue } from "./error-reporting";
import { applyAppTheme } from "./theme";
import "./styles.css";

installErrorReporting();
class AppIframe extends RpcTarget implements GatekeeperAppThemeReceiver {
  setTheme(theme: GatekeeperAppTheme): void {
    applyAppTheme(theme);
  }
}
interface Host extends RpcTarget {
  readonly ui: RpcStub<DatabaseManagementApi>;
  subscribeTheme(
    receiver: GatekeeperAppThemeReceiver,
  ): Promise<GatekeeperAppTheme>;
  setPresenting(active: boolean): Promise<unknown>;
  resolveReview(key: string, decision: "approve" | "reject"): Promise<void>;
}
let element = document.getElementById("root");
if (!element) throw new Error("Missing database app root.");
let { port1, port2 } = new MessageChannel();
window.parent.postMessage({ type: "handshake" }, "*", [port2]);
let iframe = new AppIframe();
let host = newMessagePortRpcSession<Host>(port1, iframe);
host
  .subscribeTheme(iframe)
  .then(applyAppTheme)
  .catch(() => {});
createRoot(element, {
  onUncaughtError: (error) =>
    reportIssue("database.react-root", error, {
      handled: false,
      severity: "fatal",
      captureMechanism: "react",
    }),
}).render(
  <ErrorBoundary>
    <TooltipProvider>
      <Toasty>
        <DatabasePage
          api={host.ui}
          resolveReview={(key, decision) => host.resolveReview(key, decision)}
          setPresenting={(active) => host.setPresenting(active).then(() => {})}
        />
      </Toasty>
    </TooltipProvider>
  </ErrorBoundary>,
);
