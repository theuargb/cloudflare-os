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

/**
 * One record-search result from a gatekeeper management app (GatekeeperUser.searchApp). Picking it
 * opens the app at `route`. Plain data from an untrusted app: the host validates and truncates it.
 */
export type AppSearchHit = {
  /** Unique within the app's search results. */
  id: string;
  /** Primary result label. */
  title: string;
  /** Optional secondary context, such as organization or number. */
  subtitle?: string;
  /** Short record-kind label. */
  kind?: string;
  /** App-relative route to open. */
  route: string;
};

/** Keep well-formed record-search hits from an untrusted app. */
export function sanitizeAppSearchHits(raw: unknown): AppSearchHit[] {
  if (!Array.isArray(raw)) return [];
  let result: AppSearchHit[] = [];
  let ids: Record<string, true> = {};
  for (let item of raw) {
    if (result.length >= 5) break;
    if (typeof item !== "object" || item === null) continue;
    let { id, title, subtitle, kind, route } = item as Record<string, unknown>;
    if (typeof id !== "string" || ids[id] || typeof title !== "string" || !title.trim()
        || !isAppRoute(route)) continue;
    ids[id] = true;
    result.push({
      id,
      title: title.slice(0, MAX_TEXT),
      subtitle: typeof subtitle === "string" ? subtitle.slice(0, MAX_TEXT) : undefined,
      kind: typeof kind === "string" ? kind.slice(0, 40) : undefined,
      route,
    });
  }
  return result;
}

export type AppInboxSeverity = "info" | "warning" | "error";

/**
 * One topbar inbox entry (GatekeeperUser.getInbox of the account whose description sets
 * `providesInbox`). A click marks it read and, when `appId` and `route` are set, opens that app at
 * that route. Plain data from an untrusted app: the host validates and truncates it.
 */
export type AppInboxItem = {
  id: string;
  title: string;
  body?: string;
  severity: AppInboxSeverity;
  /** ISO timestamp. */
  createdAt: string;
  unread: boolean;
  appId?: string;
  route?: string;
};

/** The actor's inbox as shown by the topbar bell: the unread total and the latest entries. */
export type AppInbox = { unread: number; items: AppInboxItem[] };

/** Most entries the host asks for and keeps. */
export const MAX_INBOX_ITEMS = 20;
const MAX_INBOX_ID = 64;
const MAX_INBOX_BODY = 280;
const INBOX_SEVERITIES: Record<AppInboxSeverity, true> = { info: true, warning: true, error: true };

/** Keep well-formed inbox entries from an untrusted provider; a link survives only when both parts are valid. */
export function sanitizeAppInbox(raw: unknown): AppInbox {
  if (typeof raw !== "object" || raw === null) return { unread: 0, items: [] };
  let { unread, items } = raw as Record<string, unknown>;
  let result: AppInboxItem[] = [];
  for (let item of Array.isArray(items) ? items : []) {
    if (result.length >= MAX_INBOX_ITEMS) break;
    if (typeof item !== "object" || item === null) continue;
    let { id, title, body, severity, createdAt, unread: itemUnread, appId, route } = item as Record<string, unknown>;
    if (typeof id !== "string" || !id || id.length > MAX_INBOX_ID || typeof title !== "string" || !title.trim()) continue;
    if (typeof severity !== "string" || !Object.hasOwn(INBOX_SEVERITIES, severity)) continue;
    if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) continue;
    let link = isAppId(appId) && isAppRoute(route) ? { appId, route } : {};
    result.push({
      id,
      title: title.slice(0, MAX_TEXT),
      body: typeof body === "string" && body ? body.slice(0, MAX_INBOX_BODY) : undefined,
      severity: severity as AppInboxSeverity,
      createdAt,
      unread: itemUnread === true,
      ...link,
    });
  }
  let count = typeof unread === "number" && Number.isFinite(unread) ? Math.max(0, Math.floor(unread)) : 0;
  return { unread: count, items: result };
}
