import { useEffect, useState } from 'react'
import type { RpcStub } from 'capnweb'
import type { AuthenticatedApi, GatekeeperAppNavigation } from '@gadgets/workshop-shared/api'
import { useAuthenticatedApi } from '../../AuthContext'

// The navigation of every management app (launcher actions, optional sidebar tree), shared by the
// sidebar, the topbar menus and Spotlight. Served instantly from memory (or localStorage after a
// reload) and refetched when older than the TTL (stale-while-revalidate); concurrent callers share one request.
const CACHE_TTL_MS = 30_000
const STORAGE_KEY = 'gadgets:app-navigation'

type Api = RpcStub<AuthenticatedApi>

let cache: { data: GatekeeperAppNavigation[]; fetchedAt: number } | null = null
let inflight: Promise<void> | null = null
// A forced refresh that arrived while a request was in flight: that request may predate the change.
let refetchQueued = false
const listeners = new Set<(data: GatekeeperAppNavigation[]) => void>()

function readStored(): GatekeeperAppNavigation[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Refetch when the copy is older than the TTL, or always with `force` (an app changed what the user
 * sees). A request already in flight is reused; a forced one then runs once more after it.
 */
export function revalidateAppNavigation(api: Api, force = false): void {
  if (inflight) {
    if (force) refetchQueued = true
    return
  }
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return
  inflight = api.listAppNavigation()
    .then((data) => {
      cache = { data, fetchedAt: Date.now() }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch { /* quota */ }
      for (const listener of listeners) listener(data)
    })
    .catch((err) => console.error('App navigation: failed to load', err))
    .finally(() => {
      inflight = null
      if (!refetchQueued) return
      refetchQueued = false
      revalidateAppNavigation(api, true)
    })
}

/** Per-app navigation (actions, sidebar tree); revalidated on mount. */
export function useAppNavigation(): GatekeeperAppNavigation[] {
  const { authenticatedApi } = useAuthenticatedApi()
  const [navigation, setNavigation] = useState(() => cache?.data ?? readStored())

  useEffect(() => {
    listeners.add(setNavigation)
    if (cache) setNavigation(cache.data)
    revalidateAppNavigation(authenticatedApi)
    return () => { listeners.delete(setNavigation) }
  }, [authenticatedApi])

  return navigation
}
