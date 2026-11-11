import { useEffect, useState } from 'react'
import type { GatekeeperWork } from '@gadgets/workshop-shared/api'
import { useAuthenticatedApi } from '../../AuthContext'

/** A queue count older than this is refetched when a view opens or the tab regains focus. */
const STALE_MS = 30_000

type Cache = { work: GatekeeperWork[]; fetchedAt: number; request?: Promise<GatekeeperWork[]> }

// Per-API-stub cache: the home screen and the launcher share one request and one answer.
const cacheByApi = new WeakMap<object, Cache>()
const listeners = new Set<(work: GatekeeperWork[]) => void>()

function load(api: { getWork(): Promise<GatekeeperWork[]> }): void {
  const cache = cacheByApi.get(api)
  if (cache?.request || (cache && Date.now() - cache.fetchedAt < STALE_MS)) return
  const request = api.getWork()
  cacheByApi.set(api, { work: cache?.work ?? [], fetchedAt: cache?.fetchedAt ?? 0, request })
  request
    .then((work) => {
      cacheByApi.set(api, { work, fetchedAt: Date.now() })
      for (const listener of listeners) listener(work)
    })
    .catch((err) => {
      cacheByApi.set(api, { work: cache?.work ?? [], fetchedAt: cache?.fetchedAt ?? 0 })
      console.error('Work queues: failed to load', err)
    })
}

/**
 * The user's work queues across the management apps (AuthenticatedApi.getWork), for the home
 * screen's "My work" and the launcher before typing. Cached per session for STALE_MS and refetched
 * on focus once stale; [] until loaded.
 */
export function useAppWork(): GatekeeperWork[] {
  const { authenticatedApi } = useAuthenticatedApi()
  const [work, setWork] = useState<GatekeeperWork[]>(() => cacheByApi.get(authenticatedApi)?.work ?? [])

  useEffect(() => {
    listeners.add(setWork)
    setWork(cacheByApi.get(authenticatedApi)?.work ?? [])
    load(authenticatedApi)
    const refresh = () => load(authenticatedApi)
    window.addEventListener('focus', refresh)
    return () => {
      listeners.delete(setWork)
      window.removeEventListener('focus', refresh)
    }
  }, [authenticatedApi])

  return work
}
