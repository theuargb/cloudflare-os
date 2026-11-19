import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useGatekeeperApps } from '../../useGatekeeperApps'
import { useAppNavigation } from '../AppNavigation/useAppNavigation'
import { GatekeeperAppIcon } from '../GatekeeperAppIcon'
import { preloadAppRoute } from '../../features/app-preload/appPreload'
import { useAppWork } from '../../features/app-work/useAppWork'
import type { SpotlightEntry } from './ranking'

/** The user's work queues as launcher rows ("My work" before typing): title, module · organization, open count. */
export function useWorkEntries(): SpotlightEntry[] {
  const navigate = useNavigate()
  const apps = useGatekeeperApps()
  const navigation = useAppNavigation()
  const work = useAppWork()

  return useMemo(() => {
    const byId = new Map(apps.map((app) => [app.id, app]))
    return work.flatMap(({ appId, items }) => {
      const app = byId.get(appId)
      if (!app) return []
      const modules = navigation.find((entry) => entry.appId === appId)?.modules ?? []
      return items.map((item): SpotlightEntry => {
        const owner = modules.find((module) => module.id === item.module)
        return {
          id: `work:${appId}:${item.id}`,
          kind: 'list',
          moduleKey: `${appId}:${owner?.id ?? ''}`,
          module: item.group ?? app.title,
          moduleIcon: <GatekeeperAppIcon app={owner ?? app} />,
          section: [item.group ?? app.title, item.subtitle].filter(Boolean).join(' · '),
          title: item.title,
          count: item.count,
          run: () => navigate({ to: '/gatekeepers/$appId', params: { appId }, search: { at: item.route } }),
          preload: () => preloadAppRoute(appId, item.route),
        }
      })
    })
  }, [apps, navigation, work, navigate])
}
