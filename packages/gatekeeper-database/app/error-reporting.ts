import { FRONTEND_ERROR_MESSAGE_TYPE, serializeException, type FrontendCaptureMechanism,
  type FrontendFrameErrorReportV1 } from "@gadgets/error-reporting";

type Options = {severity?: FrontendFrameErrorReportV1["severity"]; handled?: boolean;
  captureMechanism?: FrontendCaptureMechanism};

export function reportIssue(site: string, caught: unknown, options?: Options): void {
  try {
    if (import.meta.env.VITE_FRONTEND_ERROR_REPORTING !== "true") return;
    window.parent.postMessage({type: FRONTEND_ERROR_MESSAGE_TYPE, report: {failureSite: site,
      severity: options?.severity ?? "error", handled: options?.handled ?? true,
      captureMechanism: options?.captureMechanism ?? "explicit", exception: serializeException(caught)}}, "*");
  } catch {}
}

export function installErrorReporting(): void {
  if (import.meta.env.VITE_FRONTEND_ERROR_REPORTING !== "true") return;
  window.addEventListener("error", event => reportIssue("database.window-error", event.error,
    {handled: false, captureMechanism: "window.error"}));
  window.addEventListener("unhandledrejection", event => reportIssue("database.unhandled-rejection", event.reason,
    {handled: false, captureMechanism: "unhandledrejection"}));
}
