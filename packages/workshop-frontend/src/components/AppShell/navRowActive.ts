import { useRouterState, type LinkProps } from '@tanstack/react-router'
import { appRouteEntry } from '@gadgets/workshop-shared/app-host'

/** What a navigation row (sidebar row, top bar item) points at. */
export type NavRowTarget = {
  to?: LinkProps['to']
  params?: LinkProps['params']
  /** Row of an app entry: active only while the open app screen belongs to this entry (no entry in the route = the first one). */
  entry?: { id: string; first: boolean }
  /** Active also on paths under `to`. */
  matchPrefix?: boolean
}

/** The parts of the current location that decide which row is active. */
export type NavLocation = { pathname: string; openEntry: string | null }

/** The app entry named by an open `/gatekeepers/<app>?at=<route>` location (null when the route names none). */
function openAppEntry(search: unknown): string | null {
  if (typeof search !== 'object' || search === null || !('at' in search) || typeof search.at !== 'string') return null
  return appRouteEntry(search.at)
}

/** The current location as `isNavRowActive` reads it. */
export function useNavLocation(): NavLocation {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const openEntry = useRouterState({ select: (s) => openAppEntry(s.location.search) })
  return { pathname, openEntry }
}

/**
 * Whether a row's screen is on screen. Parameterized routes (e.g. "/gatekeepers/$appId") get their
 * params substituted so the resolved path can match.
 */
export function isNavRowActive(row: NavRowTarget, location: NavLocation): boolean {
  let target = typeof row.to === 'string' ? row.to : ''
  if (row.params) {
    for (const [key, value] of Object.entries(row.params as Record<string, string>)) {
      target = target.replaceAll(`$${key}`, String(value))
    }
  }
  const { pathname, openEntry } = location
  const onPath = row.matchPrefix ? pathname === target || pathname.startsWith(target + '/') : pathname === target
  const entry = row.entry
  return onPath && (!entry || openEntry === entry.id || (openEntry === null && entry.first))
}
