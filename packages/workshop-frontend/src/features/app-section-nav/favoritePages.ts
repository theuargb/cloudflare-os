// The user's favorite pages: app sections starred in the sidebar tree, from any app, shown under
// Home regardless of the app's own navigation lens. Kept per user on the server (user preferences).

import { useMemo } from 'react'
import { isAppRoute, type AppNavSectionKind } from '@gadgets/workshop-shared/app-host'
import { readUserPreference, useUserPreference, writeUserPreference } from '../user-preferences/userPreferences'
import { KIND_ICONS } from './kindIcons'

/** A starred page: `route` opens it in app `appId`; `group` is the sidebar row it was starred under. */
export type FavoritePage = { appId: string; route: string; label: string; group: string; kind?: AppNavSectionKind }

const FAVORITES_PREFERENCE = 'sidebar.favorites'
const MAX_FAVORITES = 50

const parseFavorites = (raw: string | null): FavoritePage[] => {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw ?? '[]')
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((item: unknown): FavoritePage[] => {
    if (typeof item !== 'object' || item === null) return []
    const { appId, route, label, group, kind } = item as Record<string, unknown>
    if (typeof appId !== 'string' || !isAppRoute(route) || typeof label !== 'string' || typeof group !== 'string') return []
    const page: FavoritePage = { appId, route, label, group }
    if (typeof kind === 'string' && Object.hasOwn(KIND_ICONS, kind)) page.kind = kind as AppNavSectionKind
    return [page]
  })
}

/** Starred pages in starring order; malformed entries are dropped. */
export function useFavoritePages(): FavoritePage[] {
  const raw = useUserPreference(FAVORITES_PREFERENCE)
  return useMemo(() => parseFavorites(raw), [raw])
}

export function isFavoritePage(list: readonly FavoritePage[], appId: string, route: string): boolean {
  return list.some((page) => page.appId === appId && page.route === route)
}

/** Adds the page (at the end) or removes it by app and route; adding past MAX_FAVORITES is ignored. */
export function toggleFavoritePage(page: FavoritePage): void {
  const list = parseFavorites(readUserPreference(FAVORITES_PREFERENCE))
  const next = isFavoritePage(list, page.appId, page.route)
    ? list.filter((item) => item.appId !== page.appId || item.route !== page.route)
    : list.length < MAX_FAVORITES
      ? [...list, page]
      : list
  if (next !== list) writeUserPreference(FAVORITES_PREFERENCE, JSON.stringify(next))
}
