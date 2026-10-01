import type { RpcTarget } from "capnweb";

/**
 * Launcher navigation between the Workshop host and a sandboxed gatekeeper app. The app's frame is
 * mounted by `srcdoc` and has no URL of its own, so the host keeps the app route in its own URL
 * (`/gatekeepers/<appId>?at=<route>`) and hands it over this channel. A route is the app's hash route
 * without the leading `#` (`section/sub?key=value`).
 */
export interface GatekeeperAppRouteReceiver extends RpcTarget {
  /** Navigate the open app (a launcher pick for the app that is already on screen). */
  setRoute(route: string): void;
}

/** Longest route the host accepts from the URL or from an app. */
export const MAX_APP_ROUTE_LENGTH = 512;

/** A route is app-relative: bounded, no scheme, no leading `#` or `/`. */
export function isAppRoute(route: unknown): route is string {
  return typeof route === "string"
    && route.length <= MAX_APP_ROUTE_LENGTH
    && !/^[#/]/.test(route)
    && !/^[a-z][a-z0-9+.-]*:/i.test(route);
}

/** A gatekeeper app id: the lowercased suffix of its GATEKEEPER_<NAME> binding. */
export function isAppId(appId: unknown): appId is string {
  return typeof appId === "string" && /^[a-z0-9_]{1,64}$/.test(appId);
}
