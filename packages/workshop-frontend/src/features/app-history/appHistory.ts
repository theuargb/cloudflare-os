import type { AnyRouter, HistoryLocation } from '@tanstack/react-router'

type RouterLocation = HistoryLocation

/** What a Workshop history entry shows: an app screen, or `null` for any other Workshop page. */
type AppEntry = { appId: string, route: string } | null

const APP_PATH = /^\/gatekeepers\/([^/]+)\/?$/

// The entry of each history index seen since the page loaded (earlier indices stay unknown).
const entries = new Map<number, AppEntry>()

function indexOf(location: RouterLocation): number | null {
  const index: unknown = location.state.__TSR_index
  return typeof index === 'number' ? index : null
}

function entryOf(router: AnyRouter, location: RouterLocation): AppEntry {
  const match = APP_PATH.exec(location.pathname)
  if (!match) return null
  const search: unknown = router.options.parseSearch(location.search)
  const at = search && typeof search === 'object' && 'at' in search ? search.at : undefined
  return { appId: decodeURIComponent(match[1]!), route: typeof at === 'string' ? at : '' }
}

const pathOf = (route: string): string => route.split('?')[0]!

function record(router: AnyRouter, location: RouterLocation): void {
  const index = indexOf(location)
  if (index !== null) entries.set(index, entryOf(router, location))
}

/** Remembers which app screen every Workshop history entry shows; returns the unsubscribe. */
export function trackAppHistory(router: AnyRouter): () => void {
  record(router, router.history.location)
  return router.history.subscribe(({ location }: { location: RouterLocation }) => record(router, location))
}

/**
 * Goes Back past the entries of the current app screen (same app, same route path, any params) when the
 * entry before them shows `appId` — at `path` when given. False when it cannot, so the app navigates itself.
 */
export function appHistoryBack(router: AnyRouter, appId: string, path: string | undefined): boolean {
  const here = indexOf(router.history.location)
  if (here === null) return false
  const current = entries.get(here)
  if (!current || current.appId !== appId) return false
  let at = here - 1
  for (let entry = entries.get(at); entry?.appId === appId && pathOf(entry.route) === pathOf(current.route); entry = entries.get(at)) at--
  const target = entries.get(at)
  if (!target || target.appId !== appId || (path !== undefined && pathOf(target.route) !== path)) return false
  router.history.go(at - here)
  return true
}
