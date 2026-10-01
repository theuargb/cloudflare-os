import type { RpcTarget } from "capnweb";

/**
 * What a launcher action does; the host colours, filters and ranks by it. `create` opens a new
 * document form, `list` a journal or register, `report` a report, `operation` a process screen
 * (close a month, run payroll, import a statement), `settings` a configuration screen.
 */
export type AppActionKind = "create" | "list" | "report" | "operation" | "settings";

/**
 * One launcher entry of a gatekeeper management app (GatekeeperUser.listAppActions). Picking it opens
 * the app at `route`. Plain data from an untrusted app: the host validates and truncates it.
 */
export type AppAction = {
  /** Unique within the app. */
  id: string;
  /** Short title in the user's language, e.g. "New cash receipt order". */
  title: string;
  /** Where it lives inside the app, e.g. "Cash desk". */
  subtitle?: string;
  /** Extra match terms: synonyms, abbreviations, legacy names. */
  keywords?: string[];
  kind: AppActionKind;
  route: string;
  /** Suggested on the home page and on an empty query: the app's few everyday actions. */
  featured?: boolean;
};

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

const ACTION_KINDS: Record<AppActionKind, true> = { create: true, list: true, report: true, operation: true, settings: true };
const MAX_ACTIONS = 200;
const MAX_TEXT = 120;
const MAX_KEYWORDS = 12;
const MAX_KEYWORD = 40;

/** Keep well-formed actions from an untrusted app: unique ids, known kinds, valid routes, capped text. */
export function sanitizeAppActions(raw: unknown): AppAction[] {
  if (!Array.isArray(raw)) return [];
  let result: AppAction[] = [];
  let ids: Record<string, true> = {};
  for (let item of raw) {
    if (result.length >= MAX_ACTIONS) break;
    if (typeof item !== "object" || item === null) continue;
    let { id, title, subtitle, keywords, kind, route, featured } = item as Record<string, unknown>;
    if (typeof id !== "string" || ids[id] || typeof title !== "string" || !title.trim()) continue;
    if (typeof kind !== "string" || !Object.hasOwn(ACTION_KINDS, kind) || !isAppRoute(route)) continue;
    ids[id] = true;
    result.push({
      id,
      title: title.slice(0, MAX_TEXT),
      subtitle: typeof subtitle === "string" ? subtitle.slice(0, MAX_TEXT) : undefined,
      keywords: Array.isArray(keywords)
        ? keywords.filter((keyword): keyword is string => typeof keyword === "string").slice(0, MAX_KEYWORDS).map((keyword) => keyword.slice(0, MAX_KEYWORD))
        : undefined,
      kind: kind as AppActionKind,
      route,
      featured: featured === true || undefined,
    });
  }
  return result;
}
