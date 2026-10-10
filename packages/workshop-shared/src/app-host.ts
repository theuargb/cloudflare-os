import type { RpcTarget } from "capnweb";
import type { RpcStub } from "capnweb";
import type { GatekeeperAppTheme, GatekeeperAppThemeReceiver } from "./theme.js";

/**
 * What a launcher action does; the host colours, filters and ranks by it. `create` opens a new
 * document form, `list` a journal or register, `report` a report, `operation` a process screen
 * (close a month, run payroll, import a statement), `settings` a configuration screen.
 */
export type AppActionKind = "create" | "list" | "report" | "operation" | "settings";

/**
 * One launcher entry of a gatekeeper management app (GatekeeperUser.getAppNavigation). Picking it opens
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
  /** Topbar menu the action is listed in: the kind of the section it opens. Absent (an overview dashboard) = Spotlight only. */
  menu?: AppMenuKind;
  /** Sub-heading inside the app's block of a menu: the sidebar entry title, else the section label. */
  group?: string;
};

/**
 * Where an action sits in the host's topbar menus: the kind of the section it opens. A module's
 * `overview` landing dashboard is the sidebar's job, so it has no menu.
 */
export type AppSectionKind = "overview" | "documents" | "registers" | "journals" | "reports" | "references" | "classifiers" | "settings";
export type AppMenuKind = Exclude<AppSectionKind, "overview" | "settings">;

/** What a management app exposes to the host shell: its launcher actions (topbar menus and ⌘K). */
export type AppNavigation = { actions: AppAction[] };

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

/**
 * The host capability the Workshop hands a sandboxed gatekeeper app's frame over its message port,
 * as the frame sees it (the frame holds an `RpcStub<GatekeeperAppHost>`). The host methods that
 * only some apps use (workspace navigation, prompts, presentation) are not part of this contract.
 */
export interface GatekeeperAppHost extends RpcTarget {
  /** Learn the current theme and register a receiver for later changes. */
  subscribeTheme(receiver: RpcStub<GatekeeperAppThemeReceiver>): GatekeeperAppTheme;
  /** Register for launcher navigation; returns the route to open (from the Workshop URL). */
  subscribeRoute(receiver: RpcStub<GatekeeperAppRouteReceiver>): string;
  /** Report an in-app navigation so the Workshop mirrors it into its URL. Invalid routes throw. */
  reportRoute(route: string): void;
  /** Open the Workshop's ⌘K launcher; keystrokes inside the frame never reach the Workshop. */
  openSearch(): void;
  /**
   * Open another gatekeeper app at a route; `newTab` opens it in a new browser tab (the frame cannot
   * open windows itself). Invalid ids or routes throw.
   */
  openApp(appId: string, route: string, newTab?: boolean): void;
  /** Reload the Workshop page: the frame cannot reload itself (a second handshake ends its session). Apps call it from a user click. */
  reloadPage(): void;
  /**
   * Read a small UI preference the Workshop keeps for apps (the frame has no storage of its own).
   * Keys are lowercase kebab-case, at most 40 characters; unset or unreadable yields null.
   */
  getAppPreference(key: string): string | null;
  /** Write a UI preference (see getAppPreference); values are at most 256 characters. */
  setAppPreference(key: string, value: string): void;
}

const ACTION_KINDS: Record<AppActionKind, true> = { create: true, list: true, report: true, operation: true, settings: true };
const MENU_KINDS: Record<AppMenuKind, true> = { documents: true, registers: true, journals: true, reports: true, references: true, classifiers: true };
const MAX_ACTIONS = 300;
const MAX_TEXT = 120;
const MAX_KEYWORDS = 12;
const MAX_KEYWORD = 40;
const MAX_GROUP = 60;

/** Keep a well-formed navigation payload from an untrusted app: invalid actions are dropped, the rest capped. */
export function sanitizeAppNavigation(raw: unknown): AppNavigation {
  if (typeof raw !== "object" || raw === null) return { actions: [] };
  return { actions: sanitizeAppActions((raw as Record<string, unknown>).actions) };
}

/** Keep well-formed actions from an untrusted app: unique ids, known kinds and menus, valid routes, capped text. */
function sanitizeAppActions(raw: unknown): AppAction[] {
  if (!Array.isArray(raw)) return [];
  let result: AppAction[] = [];
  let ids: Record<string, true> = {};
  for (let item of raw) {
    if (result.length >= MAX_ACTIONS) break;
    if (typeof item !== "object" || item === null) continue;
    let { id, title, subtitle, keywords, kind, menu, group, route, featured } = item as Record<string, unknown>;
    if (typeof id !== "string" || ids[id] || typeof title !== "string" || !title.trim()) continue;
    if (typeof kind !== "string" || !Object.hasOwn(ACTION_KINDS, kind) || !isAppRoute(route)) continue;
    if (menu !== undefined && (typeof menu !== "string" || !Object.hasOwn(MENU_KINDS, menu))) continue;
    ids[id] = true;
    result.push({
      id,
      title: title.slice(0, MAX_TEXT),
      subtitle: typeof subtitle === "string" ? subtitle.slice(0, MAX_TEXT) : undefined,
      keywords: Array.isArray(keywords)
        ? keywords.filter((keyword): keyword is string => typeof keyword === "string").slice(0, MAX_KEYWORDS).map((keyword) => keyword.slice(0, MAX_KEYWORD))
        : undefined,
      kind: kind as AppActionKind,
      menu: menu as AppMenuKind | undefined,
      group: typeof group === "string" && group.trim() ? group.slice(0, MAX_GROUP) : undefined,
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
