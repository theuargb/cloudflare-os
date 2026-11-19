import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useGatekeeperApps } from '../../useGatekeeperApps'
import { useAppNavigation } from '../AppNavigation/useAppNavigation'
import { GatekeeperAppIcon } from '../GatekeeperAppIcon'
import { preloadAppRoute } from '../../features/app-preload/appPreload'
import type { SpotlightEntry } from './ranking'

/**
 * The registered actions of every management app the user can open, in sidebar order: the launcher's
 * app entries and the topbar type menus. `moduleKey` is `<appId>:<module id>` (empty module id for a
 * single-module app).
 */
export function useAppActionEntries(): SpotlightEntry[] {
  const navigate = useNavigate()
  const apps = useGatekeeperApps()
  const navigation = useAppNavigation()

  return useMemo(() => {
    const byApp = new Map(navigation.map((entry) => [entry.appId, entry]))
    const entries: SpotlightEntry[] = []
    // Apps in sidebar order; actions of apps the user can no longer open (stale localStorage copy) are skipped.
    // A composed app lists its modules in `modules`: actions group and label by their module, not by the app.
    for (const app of apps) {
      const appId = app.id
      const appIcon = <GatekeeperAppIcon app={app} />
      const { actions = [], modules = [] } = byApp.get(appId) ?? {}
      const owners = new Map(modules.map((owner) => [owner.id, owner]))
      for (const action of actions) {
        const owner = action.module ? owners.get(action.module) : undefined
        entries.push({
          id: `app:${appId}:${action.id}`,
          kind: action.kind,
          moduleKey: `${appId}:${owner?.id ?? ''}`,
          module: owner?.title ?? app.title,
          moduleIcon: owner ? <GatekeeperAppIcon app={owner} /> : appIcon,
          section: action.subtitle,
          menu: action.menu,
          group: action.group,
          title: action.title,
          keywords: action.keywords,
          featured: action.featured,
          run: () => navigate({ to: '/gatekeepers/$appId', params: { appId }, search: { at: action.route } }),
          preload: () => preloadAppRoute(appId, action.route),
        })
      }
    }
    return entries
  }, [apps, navigation, navigate])
}
