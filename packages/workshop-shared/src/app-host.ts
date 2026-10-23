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
  /** Suggested on the home page and boosted in launcher ranking: the app's few everyday actions. */
  featured?: boolean;
  /** Launcher (topbar Menu) type the action is grouped under: the kind of the section it opens. Absent = the Settings type for `settings` actions, else Other. */
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

/** A link out of the Workshop: opens `href` (http/https) in a new browser tab. */
export type AppExternalLink = { id: string; title: string; href: string };

/** One choice of the app's workplace switcher. */
export type AppWorkplace = { id: string; title: string; description?: string };

/**
 * A topbar switcher between named views of an app's navigation. The app applies the choice
 * server-side (GatekeeperUser.selectAppWorkplace) and the host refetches the navigation.
 */
export type AppWorkplaces = {
  /** Trigger caption: the app's word for "workplace". */
  label: string;
  /** Id of one of `options`. */
  current: string;
  options: AppWorkplace[];
  /** Links to other systems listed under the options. */
  external?: { title: string; links: AppExternalLink[] };
};

/**
 * One sidebar section an app publishes (AppNavigation.sidebar); the Workshop merges it with other
 * apps' sections of the same title and orders sections by `order` (VendorGroup.order). Items are
 * entries: each route carries `entry=<id>` (APP_ENTRY_PARAM), which drives the row highlight.
 * `links` are rows that open an external page in a new tab.
 */
export type AppSidebarGroup = { title: string; order: number; items: AppEntry[]; links?: AppExternalLink[] };

/**
 * What a management app exposes to the host shell: its launcher actions (topbar menus and ⌘K) and,
 * optionally, its per-user sidebar tree, which replaces the app's own row or vendor entries, and a
 * workplace switcher.
 */
export type AppNavigation = { actions: AppAction[]; sidebar?: AppSidebarGroup[]; workplaces?: AppWorkplaces };

/**
 * Launcher navigation between the Workshop host and a sandboxed gatekeeper app. The frame has no
 * URL the user sees, so the host keeps the app route in its own URL (`/gatekeepers/<appId>?at=<route>`)
 * and hands Workshop-side changes (sidebar, launcher, Back/Forward, app links) to the open app over
 * this channel; nothing remounts. A route is the app's hash route without the leading `#`
 * (`section/sub?key=value`).
 */
export interface GatekeeperAppRouteReceiver extends RpcTarget {
  /** Navigate the open app to a route the app did not report itself. */
  setRoute(route: string): void;
}

/**
 * How a reported route enters the Workshop history: `push` adds an entry (a new screen: module,
 * section, record), `replace` overwrites the current one (filters, tabs, period on the same screen).
 */
export type AppRouteMode = "push" | "replace";

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

/** Longest frame URL the host loads. */
const MAX_APP_FRAME_URL_LENGTH = 512;

/**
 * A frame URL (GatekeeperUiFrame.iframeUrl) is a same-origin path under the vendor's own
 * `/gatekeeper/<vendor>/` prefix (underscores in the id become dashes), without `//`, `\` or `..`
 * segments, so an app can never point its frame at another vendor's or the Workshop's routes.
 */
export function isAppFrameUrl(url: unknown, vendorId: string): url is string {
  return typeof url === "string"
    && url.length <= MAX_APP_FRAME_URL_LENGTH
    && url.startsWith(`/gatekeeper/${vendorId.replaceAll("_", "-")}/`)
    && !url.includes("//")
    && !url.includes("\\")
    && !url.split(/[?#]/)[0]!.split("/").includes("..");
}

/**
 * The host capability the Workshop hands a sandboxed gatekeeper app's frame over its message port,
 * as the frame sees it (the frame holds an `RpcStub<GatekeeperAppHost>`). The host methods that
 * only some apps use (workspace navigation, prompts, presentation) are not part of this contract.
 */
export interface GatekeeperAppHost extends RpcTarget {
  /** Learn the current theme and register a receiver for later changes. */
  subscribeTheme(receiver: RpcStub<GatekeeperAppThemeReceiver>): GatekeeperAppTheme;
  /** Register for Workshop-side navigation; returns the route to open (from the Workshop URL). */
  subscribeRoute(receiver: RpcStub<GatekeeperAppRouteReceiver>): string;
  /**
   * Report an in-app navigation so the Workshop mirrors it into its URL; `mode` (default `replace`)
   * decides whether Back returns to the previous screen. Invalid routes or modes throw.
   */
  reportRoute(route: string, mode?: AppRouteMode): void;
  /** Open the Workshop's ⌘K launcher; keystrokes inside the frame never reach the Workshop. */
  openSearch(): void;
  /**
   * Open another gatekeeper app at a route; `newTab` opens it in a new browser tab (the frame cannot
   * open windows itself). Invalid ids or routes throw.
   */
  openApp(appId: string, route: string, newTab?: boolean): void;
  /**
   * Re-read the user's apps and navigation (sidebar tree, actions), e.g. after the app changed which
   * of its areas the user sees. Calls in quick succession are ignored.
   */
  refreshNavigation(): void;
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

/**
 * Reserved hash param of an app route that names the sidebar entry the screen belongs to
 * (`documents?entry=sales`). The host reads it to highlight the entry's row; the app keeps it sticky.
 */
export const APP_ENTRY_PARAM = "entry";

/**
 * One sidebar row of an app that serves several business areas (VendorDescription.entries): the
 * Workshop lists one row per entry instead of one for the app. Picking it opens the app at `route`,
 * which carries `entry=<id>` (APP_ENTRY_PARAM). Plain data from the vendor, validated by the host.
 */
export type AppEntry = {
  /** Unique within the app; kebab-case. */
  id: string;
  /** Row label in the user's language, e.g. "Purchases". */
  title: string;
  /** App route the row opens; its `entry` param equals `id`. */
  route: string;
  /** Optional row icon (an `AvatarImage`, kept structural: this file stays free of worker types); the app's own icon is used when absent. */
  icon?: { url: string };
};

/** The `entry` param of an app route (`section/path?entry=sales`), or null. */
export function appRouteEntry(route: string | undefined): string | null {
  const query = route?.split("?")[1];
  return query ? new URLSearchParams(query).get(APP_ENTRY_PARAM) : null;
}

const MAX_ENTRIES = 12;
const MAX_ENTRY_TITLE = 60;
const ENTRY_ID = /^[a-z][a-z0-9-]{0,31}$/;

/** One well-formed entry (unique kebab-case id, a title, a valid route naming its own entry), or null. */
function sanitizeEntry(item: unknown, ids: Record<string, true>): AppEntry | null {
  if (typeof item !== "object" || item === null) return null;
  let { id, title, route, icon } = item as Record<string, unknown>;
  if (typeof id !== "string" || !ENTRY_ID.test(id) || ids[id]) return null;
  if (typeof title !== "string" || !title.trim() || !isAppRoute(route) || appRouteEntry(route) !== id) return null;
  ids[id] = true;
  let url = typeof icon === "object" && icon !== null ? (icon as Record<string, unknown>).url : undefined;
  return { id, title: title.slice(0, MAX_ENTRY_TITLE), route, icon: typeof url === "string" ? { url } : undefined };
}

/** Keep well-formed entries (see sanitizeEntry). Fewer than two valid entries means none. */
export function sanitizeAppEntries(raw: unknown): AppEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  let result: AppEntry[] = [];
  let ids: Record<string, true> = {};
  for (let item of raw) {
    if (result.length >= MAX_ENTRIES) break;
    let entry = sanitizeEntry(item, ids);
    if (entry) result.push(entry);
  }
  return result.length > 1 ? result : undefined;
}

const MAX_SIDEBAR_GROUPS = 24;
const MAX_SIDEBAR_ITEMS = 240;
const MAX_EXTERNAL_LINKS = 50;
const MAX_LINK_HREF = 2048;

/** A workplace or external link id: lowercase kebab, at most 64 characters. */
export function isAppWorkplaceId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(id);
}

/** One well-formed external link (unique id, a title, an http/https `href`), or null. */
function sanitizeExternalLink(item: unknown, ids: Record<string, true>): AppExternalLink | null {
  if (typeof item !== "object" || item === null) return null;
  let { id, title, href } = item as Record<string, unknown>;
  if (!isAppWorkplaceId(id) || ids[id]) return null;
  if (typeof title !== "string" || !title.trim()) return null;
  if (typeof href !== "string" || href.length > MAX_LINK_HREF) return null;
  try {
    let { protocol } = new URL(href);
    if (protocol !== "http:" && protocol !== "https:") return null;
  } catch {
    return null;
  }
  ids[id] = true;
  return { id, title: title.trim().slice(0, MAX_ENTRY_TITLE), href };
}

/** Keep well-formed external links, capped. */
function sanitizeExternalLinks(raw: unknown, max: number): AppExternalLink[] {
  if (!Array.isArray(raw)) return [];
  let result: AppExternalLink[] = [];
  let ids: Record<string, true> = {};
  for (let item of raw) {
    if (result.length >= max) break;
    let link = sanitizeExternalLink(item, ids);
    if (link) result.push(link);
  }
  return result;
}

/**
 * Keep a well-formed sidebar tree: groups need a title and a finite order, items are entries with ids
 * unique across the whole tree, links are external rows with their own unique ids; groups without
 * either are dropped, groups and items capped. No group left means no tree (the app keeps its own row).
 */
function sanitizeAppSidebar(raw: unknown): AppSidebarGroup[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  let result: AppSidebarGroup[] = [];
  let ids: Record<string, true> = {};
  let linkIds: Record<string, true> = {};
  let count = 0;
  for (let group of raw) {
    if (result.length >= MAX_SIDEBAR_GROUPS || count >= MAX_SIDEBAR_ITEMS) break;
    if (typeof group !== "object" || group === null) continue;
    let { title, order, items, links } = group as Record<string, unknown>;
    if (typeof title !== "string" || !title.trim() || typeof order !== "number" || !Number.isFinite(order)) continue;
    if (!Array.isArray(items)) continue;
    let kept: AppEntry[] = [];
    for (let item of items) {
      if (count >= MAX_SIDEBAR_ITEMS) break;
      let entry = sanitizeEntry(item, ids);
      if (!entry) continue;
      kept.push(entry);
      count++;
    }
    let keptLinks: AppExternalLink[] = [];
    for (let item of Array.isArray(links) ? links : []) {
      if (count >= MAX_SIDEBAR_ITEMS) break;
      let link = sanitizeExternalLink(item, linkIds);
      if (!link) continue;
      keptLinks.push(link);
      count++;
    }
    if (kept.length === 0 && keptLinks.length === 0) continue;
    let clean: AppSidebarGroup = { title: title.trim().slice(0, MAX_GROUP), order, items: kept };
    if (keptLinks.length > 0) clean.links = keptLinks;
    result.push(clean);
  }
  return result.length > 0 ? result : undefined;
}

const MAX_WORKPLACES = 50;
const MAX_WORKPLACE_LABEL = 24;

/** Keep a well-formed workplace switcher: unique options, `current` among them, valid links; else none. */
function sanitizeAppWorkplaces(raw: unknown): AppWorkplaces | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  let { label, current, options, external } = raw as Record<string, unknown>;
  if (typeof label !== "string" || !label.trim() || !Array.isArray(options)) return undefined;
  let kept: AppWorkplace[] = [];
  let ids: Record<string, true> = {};
  for (let item of options) {
    if (kept.length >= MAX_WORKPLACES) break;
    if (typeof item !== "object" || item === null) continue;
    let { id, title, description } = item as Record<string, unknown>;
    if (!isAppWorkplaceId(id) || ids[id] || typeof title !== "string" || !title.trim()) continue;
    ids[id] = true;
    let option: AppWorkplace = { id, title: title.trim().slice(0, MAX_ENTRY_TITLE) };
    if (typeof description === "string" && description.trim())
      option.description = description.trim().slice(0, MAX_TEXT);
    kept.push(option);
  }
  if (kept.length === 0 || typeof current !== "string" || !ids[current]) return undefined;
  let result: AppWorkplaces = { label: label.trim().slice(0, MAX_WORKPLACE_LABEL), current, options: kept };
  if (typeof external === "object" && external !== null) {
    let { title, links } = external as Record<string, unknown>;
    let keptLinks = sanitizeExternalLinks(links, MAX_EXTERNAL_LINKS);
    if (typeof title === "string" && title.trim() && keptLinks.length > 0) {
      result.external = { title: title.trim().slice(0, MAX_ENTRY_TITLE), links: keptLinks };
    }
  }
  return result;
}

const ACTION_KINDS: Record<AppActionKind, true> = { create: true, list: true, report: true, operation: true, settings: true };
const MENU_KINDS: Record<AppMenuKind, true> = { documents: true, registers: true, journals: true, reports: true, references: true, classifiers: true };
// One app may publish every module's actions (a composed app), hence the generous cap.
const MAX_ACTIONS = 1000;
const MAX_TEXT = 120;
const MAX_KEYWORDS = 12;
const MAX_KEYWORD = 40;
const MAX_GROUP = 60;

/** Keep a well-formed navigation payload from an untrusted app: invalid actions, sidebar items and workplaces are dropped, the rest capped. */
export function sanitizeAppNavigation(raw: unknown): AppNavigation {
  if (typeof raw !== "object" || raw === null) return { actions: [] };
  let { actions, sidebar, workplaces } = raw as Record<string, unknown>;
  let result: AppNavigation = { actions: sanitizeAppActions(actions) };
  let tree = sanitizeAppSidebar(sidebar);
  if (tree) result.sidebar = tree;
  let switcher = sanitizeAppWorkplaces(workplaces);
  if (switcher) result.workplaces = switcher;
  return result;
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
