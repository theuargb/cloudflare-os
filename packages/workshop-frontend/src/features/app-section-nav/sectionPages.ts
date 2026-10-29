import { useRouterState } from '@tanstack/react-router'
import type { AppNavSection } from '@gadgets/workshop-shared/app-host'
import { useAppSectionNav } from './sectionNavStore'

/** The pages a sidebar row lists: `live` ones come from the open app (picked over its channel), the others are opened by route. */
export type RowPages = { sections: AppNavSection[]; current: string | null; live: boolean }

/** The open app route (`?at=`) of a location's search, or null. */
export function searchAt(search: unknown): string | null {
  if (typeof search !== 'object' || search === null || !('at' in search) || typeof search.at !== 'string') return null
  return search.at
}

/** An app route without its query: a page is the same page whatever its in-page params. */
export const routePath = (route: string) => route.split('?', 1)[0]

/** The route path the app `appId` is open at on screen, or null while another screen is shown. */
export function useOpenAppPath(appId: string): string | null {
  return useRouterState({
    select: (state) => {
      if (state.location.pathname !== `/gatekeepers/${appId}`) return null
      const at = searchAt(state.location.search)
      return at === null ? null : routePath(at)
    },
  })
}

/**
 * A row's pages: while the row's screen is on screen (`active`) and its app publishes its navigation,
 * the live one (counts, the open section); otherwise the row's static pages, the open one marked by route.
 */
export function useRowPages(
  appId: string,
  entry: { id: string; first: boolean } | undefined,
  active: boolean,
  pages: AppNavSection[] | undefined,
): RowPages | null {
  const nav = useAppSectionNav(appId, entry)
  const openPath = useOpenAppPath(appId)
  if (active && nav) return { sections: nav.sections, current: nav.active, live: true }
  if (!pages) return null
  const current = active ? pages.find((page) => page.route !== undefined && routePath(page.route) === openPath) : undefined
  return { sections: pages, current: current?.id ?? null, live: false }
}
