import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useKumoToastManager } from '@cloudflare/kumo'
import { SquaresFourIcon } from '@phosphor-icons/react'
import type { GatekeeperAppActions, OutputFormatOffer } from '@gadgets/workshop-shared/api'
import { useAuthenticatedApi } from '../../AuthContext'
import { useGatekeeperApps } from '../../useGatekeeperApps'
import { createFromFormat } from '../format/useOutputFormats'
import { GatekeeperAppIcon } from '../GatekeeperAppIcon'
import type { SpotlightEntry } from './ranking'

type SpotlightData = { formats: OutputFormatOffer[]; actions: GatekeeperAppActions[] }

// Served instantly on open, refetched when older than the TTL (stale-while-revalidate). App actions
// are also kept in localStorage so the first ⌘K after a reload already finds them.
const CACHE_TTL_MS = 30_000
const ACTIONS_STORAGE_KEY = 'gadgets:spotlight-actions'
const CORE_MODULE = 'Робочі простори'
let cache: { data: SpotlightData; fetchedAt: number } | null = null

function readStoredActions(): GatekeeperAppActions[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(ACTIONS_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Every launcher action — the registered actions of each management app the user can open, then
 * the core ones (new workspace, new output formats). Refreshed on mount when the cache is stale.
 */
export function useSpotlightEntries(): SpotlightEntry[] {
  const { authenticatedApi } = useAuthenticatedApi()
  const navigate = useNavigate()
  const toasts = useKumoToastManager()
  const apps = useGatekeeperApps()
  const [data, setData] = useState<SpotlightData>(() => cache?.data ?? { formats: [], actions: readStoredActions() })

  useEffect(() => {
    if (cache) setData(cache.data)
    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return
    let cancelled = false
    Promise.all([authenticatedApi.listOutputFormats(), authenticatedApi.listAppActions()])
      .then(([formats, actions]) => {
        const next: SpotlightData = { formats, actions }
        cache = { data: next, fetchedAt: Date.now() }
        try { localStorage.setItem(ACTIONS_STORAGE_KEY, JSON.stringify(actions)) } catch { /* quota */ }
        if (!cancelled) setData(next)
      })
      .catch((err) => console.error('Spotlight: failed to load actions', err))
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
    for (const { appId, actions } of data.actions) {
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
      title: 'Створити робочий простір',
      keywords: ['новий чат', 'асистент', 'розмова', 'діалог'],
      featured: true,
      run: () => navigate({ to: '/' }),
    })
    for (const format of data.formats) {
      entries.push({
        id: `format:${format.blueprintId}`,
        kind: 'create',
        module: CORE_MODULE,
        moduleIcon: coreIcon,
        title: `Створити: ${format.output.noun}`,
        run: () => { void createFormat(format) },
      })
    }
    return entries
  }, [apps, data, navigate, createFormat])
}
