// Fan-out of the app-host surface (navigation, record search, topbar inbox) across a user's
// management-app accounts. Every gatekeeper answer is untrusted and bounded: each call runs under
// a deadline, a failing or slow app is isolated from the others, and entries are sanitized.

import type { GatekeeperAppNavigation, GatekeeperInbox } from "@gadgets/workshop-shared/api";
import type { AccountDescription, AppUiContext, GatekeeperUser } from "@gadgets/workshop-shared/gatekeeper";
import {
  sanitizeAppNavigation, sanitizeAppInbox, sanitizeAppSearchHits, MAX_INBOX_ITEMS,
} from "@gadgets/workshop-shared/app-host";
import { createWorkshopLogger } from "./observability";

const logger = createWorkshopLogger("workshop.app-host");

/** Per-app deadline for navigation; slow apps must not hold the launcher. */
const APP_NAVIGATION_TIMEOUT_MS = 1500;

/** Per-app deadline for record search; slow apps must not hold Spotlight. */
const APP_SEARCH_TIMEOUT_MS = 800;

/** Deadline for the topbar inbox, which every open tab polls; a slow provider must not pile up calls. */
const APP_INBOX_TIMEOUT_MS = 1500;

/**
 * The app-host methods of a GatekeeperUser, which are optional on the interface. They are called
 * only on accounts whose description declares the matching capability (`providesUi`,
 * `providesInbox`), which is why they can be viewed as required.
 */
export type AppHostStub =
    Required<Pick<GatekeeperUser, "getAppNavigation" | "searchApp" | "getInbox" | "markInboxRead">>;

/** One provided account as the fan-out sees it. `appId` is the vendor id, which names the app. */
export type AppHostAccount = { appId: string, description: AccountDescription, stub: AppHostStub };

function withDeadline<T>(call: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    call,
    scheduler.wait(ms).then((): never => { throw new Error("timeout"); }),
  ]);
}

/**
 * Navigation (launcher actions) of every management app (AuthenticatedApi.listAppNavigation):
 * all providesUi accounts are asked in parallel, each bounded by APP_NAVIGATION_TIMEOUT_MS. A
 * missing method, an error or a timeout yields no actions for that app. Actions are untrusted:
 * invalid ones are dropped and the rest are capped.
 */
export async function listAppNavigation(accounts: AppHostAccount[], context: AppUiContext)
    : Promise<GatekeeperAppNavigation[]> {
  return Promise.all(accounts.filter(account => account.description.providesUi).map(async account => {
    try {
      let raw = await withDeadline(account.stub.getAppNavigation(context), APP_NAVIGATION_TIMEOUT_MS);
      return { appId: account.appId, ...sanitizeAppNavigation(raw) };
    } catch (err) {
      logger.warn("app navigation unavailable", {
        event: "gatekeeper.app.navigation.failed", vendorId: account.appId, error: err,
      });
      return { appId: account.appId, actions: [] };
    }
  }));
}

/**
 * Record search of one management app (AuthenticatedApi.searchApp). The account is selected by
 * vendor id, constrained to UI providers, and cannot stall Spotlight beyond APP_SEARCH_TIMEOUT_MS.
 */
export async function searchApp(accounts: AppHostAccount[], context: AppUiContext,
                                appId: string, query: string) {
  query = query.trim();
  if (query.length < 2 || query.length > 100) return [];
  let account = accounts.find(candidate => candidate.appId === appId && candidate.description.providesUi);
  if (!account) return [];
  try {
    let raw = await withDeadline(account.stub.searchApp(context, { query, limit: 5 }), APP_SEARCH_TIMEOUT_MS);
    return sanitizeAppSearchHits(raw);
  } catch (err) {
    logger.warn("app search unavailable", {
      event: "gatekeeper.app.search.failed", vendorId: account.appId, error: err,
    });
    return [];
  }
}

/**
 * Topbar inbox (AuthenticatedApi.getInbox); the provider's entries are untrusted and sanitized. A
 * failing or slow provider yields no inbox.
 */
export async function getInbox(accounts: AppHostAccount[], context: AppUiContext)
    : Promise<GatekeeperInbox | null> {
  // The inbox provider is the first account whose description sets providesInbox.
  let provider = accounts.find(account => account.description.providesInbox);
  if (!provider) return null;
  try {
    let raw = await withDeadline(provider.stub.getInbox(context, MAX_INBOX_ITEMS), APP_INBOX_TIMEOUT_MS);
    return { ...sanitizeAppInbox(raw), appId: provider.appId };
  } catch (err) {
    logger.warn("app inbox unavailable", {
      event: "gatekeeper.app.inbox.failed", vendorId: provider.appId, error: err,
    });
    return null;
  }
}

/** Marks inbox entries read at the inbox provider; a failing or slow provider is logged and ignored. */
export async function markInboxRead(accounts: AppHostAccount[], context: AppUiContext, ids: string[])
    : Promise<void> {
  // The inbox provider is the first account whose description sets providesInbox.
  let provider = accounts.find(account => account.description.providesInbox);
  if (!provider) return;
  try {
    await withDeadline(provider.stub.markInboxRead(context, ids), APP_INBOX_TIMEOUT_MS);
  } catch (err) {
    logger.warn("app inbox update unavailable", {
      event: "gatekeeper.app.inbox.mark.failed", vendorId: provider.appId, error: err,
    });
  }
}
