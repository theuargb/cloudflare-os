import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useKumoToastManager } from '@cloudflare/kumo'
import { SquaresFourIcon } from '@phosphor-icons/react'
import type { OutputFormatOffer } from '@gadgets/workshop-shared/api'
import { useAuthenticatedApi } from '../../AuthContext'
import { useGatekeeperApps } from '../../useGatekeeperApps'
import { useAppNavigation } from '../AppNavigation/useAppNavigation'
import { createFromFormat } from '../format/useOutputFormats'
import { GatekeeperAppIcon } from '../GatekeeperAppIcon'
import type { SpotlightEntry } from './ranking'

// Output formats are served instantly on open and refetched when older than the TTL
// (stale-while-revalidate). App actions come from the shared navigation store.
const CACHE_TTL_MS = 30_000
const CORE_MODULE = 'Workspaces'
let formatsCache: { data: OutputFormatOffer[]; fetchedAt: number } | null = null

/**
 * Every launcher action — the registered actions of each management app the user can open, then
 * the core ones (new workspace, new output formats). Refreshed on mount when the cache is stale.
 */
export function useSpotlightEntries(): SpotlightEntry[] {
  const { authenticatedApi } = useAuthenticatedApi()
  const navigate = useNavigate()
  const toasts = useKumoToastManager()
  const apps = useGatekeeperApps()
  const navigation = useAppNavigation()
  const [formats, setFormats] = useState<OutputFormatOffer[]>(() => formatsCache?.data ?? [])

  useEffect(() => {
    if (formatsCache) setFormats(formatsCache.data)
    if (formatsCache && Date.now() - formatsCache.fetchedAt < CACHE_TTL_MS) return
    let cancelled = false
    authenticatedApi.listOutputFormats()
      .then((data) => {
        formatsCache = { data, fetchedAt: Date.now() }
        if (!cancelled) setFormats(data)
      })
      .catch((err) => console.error('Spotlight: failed to load output formats', err))
    return () => { cancelled = true }
  }, [authenticatedApi])

  const createFormat = useCallback(
    (format: OutputFormatOffer) => createFromFormat(authenticatedApi, navigate, toasts, format).catch(() => {}),
    [authenticatedApi, navigate, toasts],
  )

  return useMemo(() => {
    const appsById = Object.fromEntries(apps.map((app) => [app.id, app]))
    const entries: SpotlightEntry[] = []
    // Actions of apps the user can no longer open (stale localStorage copy) are skipped.
    for (const { appId, actions } of navigation) {
      const app = appsById[appId]
      if (!app) continue
      const moduleIcon = <GatekeeperAppIcon app={app} />
      for (const action of actions) {
        entries.push({
          id: `app:${appId}:${action.id}`,
          kind: action.kind,
          appId,
          module: app.title,
          moduleIcon,
          section: action.subtitle,
          title: action.title,
          keywords: action.keywords,
          featured: action.featured,
          run: () => navigate({ to: '/gatekeepers/$appId', params: { appId }, search: { at: action.route } }),
        })
      }
    }
    const coreIcon = <SquaresFourIcon size={14} />
    entries.push({
      id: 'core:new-workspace',
      kind: 'create',
      module: CORE_MODULE,
      moduleIcon: coreIcon,
      title: 'Create workspace',
      keywords: ['new chat', 'assistant', 'conversation', 'dialog'],
      featured: true,
      run: () => navigate({ to: '/' }),
    })
    for (const format of formats) {
      entries.push({
        id: `format:${format.blueprintId}`,
        kind: 'create',
        module: CORE_MODULE,
        moduleIcon: coreIcon,
        title: `Create: ${format.output.noun}`,
        run: () => { void createFormat(format) },
      })
    }
    return entries
  }, [apps, navigation, formats, navigate, createFormat])
}
