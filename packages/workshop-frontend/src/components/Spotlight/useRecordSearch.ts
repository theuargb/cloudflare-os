import { useEffect, useRef, useState } from 'react'
import type { AppSearchHit } from '@gadgets/workshop-shared/app-host'
import type { GatekeeperAppInfo } from '@gadgets/workshop-shared/api'
import { useAuthenticatedApi } from '../../AuthContext'
import { useGatekeeperApps } from '../../useGatekeeperApps'

export type RecordGroup = { app: GatekeeperAppInfo; hits: AppSearchHit[] }

const DEBOUNCE_MS = 200
const MIN_QUERY = 2

/**
 * Record search (⌘K P2): after a short pause every management app is asked in parallel for records
 * matching the query. Groups appear as each app answers; an app that fails or has no search yields
 * nothing. Responses to an older query are dropped.
 */
export function useRecordSearch(query: string): RecordGroup[] {
  const { authenticatedApi } = useAuthenticatedApi()
  const apps = useGatekeeperApps()
  const [hitsByApp, setHitsByApp] = useState<Record<string, AppSearchHit[]>>({})
  const token = useRef(0)
  const needle = query.trim()

  useEffect(() => {
    const current = ++token.current
    setHitsByApp({})
    if (needle.length < MIN_QUERY) return
    const timer = setTimeout(() => {
      for (const app of apps) {
        authenticatedApi.searchApp(app.id, needle)
          .then((hits) => {
            if (current !== token.current || hits.length === 0) return
            setHitsByApp((previous) => ({ ...previous, [app.id]: hits }))
          })
          .catch(() => {})
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [needle, apps, authenticatedApi])

  return apps.flatMap((app) => (hitsByApp[app.id] ? [{ app, hits: hitsByApp[app.id] }] : []))
}
