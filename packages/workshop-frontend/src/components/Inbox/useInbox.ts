import { useCallback, useEffect, useState } from 'react'
import type { GatekeeperInbox } from '@gadgets/workshop-shared/api'
import { useAuthenticatedApi } from '../../AuthContext'

/** Bell refresh cadence while the tab is visible; a focus or an open refreshes at once. */
const POLL_MS = 30_000

export type InboxState = {
  /** Null until loaded, and when the deployment has no inbox provider. */
  inbox: GatekeeperInbox | null
  refresh: () => void
  /** Optimistically marks entries read (empty = all), then syncs with the provider. */
  markRead: (ids: string[]) => void
}

/** The topbar inbox of the deployment's inbox provider, polled while the tab is visible. */
export function useInbox(): InboxState {
  const { authenticatedApi } = useAuthenticatedApi()
  const [inbox, setInbox] = useState<GatekeeperInbox | null>(null)

  const refresh = useCallback(() => {
    authenticatedApi.getInbox()
      .then(setInbox)
      .catch((err) => console.error('Inbox: failed to load', err))
  }, [authenticatedApi])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, POLL_MS)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  const markRead = useCallback((ids: string[]) => {
    setInbox((current) => {
      if (!current) return current
      const hit = (id: string) => ids.length === 0 || ids.includes(id)
      const cleared = current.items.filter((item) => item.unread && hit(item.id)).length
      return {
        ...current,
        unread: ids.length === 0 ? 0 : Math.max(0, current.unread - cleared),
        items: current.items.map((item) => (hit(item.id) ? { ...item, unread: false } : item)),
      }
    })
    authenticatedApi.markInboxRead(ids)
      .catch((err) => console.error('Inbox: failed to mark read', err))
      .finally(refresh)
  }, [authenticatedApi, refresh])

  return { inbox, refresh, markRead }
}
