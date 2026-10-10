import { useMemo } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useGatekeeperApps } from '../../useGatekeeperApps'
import AppMenu from './AppMenu'
import { buildTopNav, currentScreen } from './topNavModel'
import { useAppNavigation } from './useAppNavigation'

/**
 * Global Menu of the top bar (like a desktop app bar): one bordered button whose popover holds a
 * rail of screen kinds — Documents, Registers, Journals, Reports, References, Classifiers — and the
 * launcher actions (the same ones Spotlight runs) that open a screen of the hovered kind, from every
 * module the user can open. Settings screens are not listed: they are reached through Spotlight (⌘K).
 * The sidebar goes to modules and entries, in-module tabs to screens, the menu and Spotlight run
 * actions. Hidden on narrow screens: the sidebar drawer and Spotlight cover them.
 */
export default function TopNav() {
  const apps = useGatekeeperApps()
  const navigation = useAppNavigation()
  const menus = useMemo(() => buildTopNav(apps, navigation), [apps, navigation])
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const at = useRouterState({
    select: (state) => {
      const search: unknown = state.location.search
      return typeof search === 'object' && search !== null && 'at' in search && typeof search.at === 'string' ? search.at : undefined
    },
  })
  const current = currentScreen(pathname, at)

  if (menus.length === 0) return null
  return (
    <nav aria-label="Sections" className="hidden items-center md:flex">
      <AppMenu menus={menus} current={current} />
    </nav>
  )
}
