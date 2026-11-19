// The signed-in user's UI preferences (sidebar layout, finished tours, gatekeeper app preferences),
// kept per user on the server. Loaded once before the shell renders (or seeded from the previous
// visit's boot snapshot so the shell renders at once, then replaced by the server copy), held in
// memory and written through key by key, so every browser of the user shows the same state.

import { useSyncExternalStore } from 'react'
import type { RpcStub } from 'capnweb'
import type { AuthenticatedApi } from '@gadgets/workshop-shared/api'
import { logRpcFailure } from '../../rpcErrors'
import { writeBootSnapshot } from '../boot-snapshot/bootSnapshot'

let api: RpcStub<AuthenticatedApi> | null = null
let values: ReadonlyMap<string, string> = new Map()
// The session whose values were seeded from its snapshot; a failed load keeps those, not another session's.
let seededApi: RpcStub<AuthenticatedApi> | null = null
// Writes made while the server copy loads, re-applied on top of it so a click during the load is not lost.
let hydrating = false
const pendingWrites = new Map<string, string | null>()
const listeners = new Set<() => void>()

const notify = () => {
  for (const listener of listeners) listener()
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange)
  return () => {
    listeners.delete(onChange)
  }
}

/** Shows the previous visit's preferences at once; `hydrateUserPreferences` replaces them with the server's. */
export function seedUserPreferences(authenticatedApi: RpcStub<AuthenticatedApi>, seeded: Record<string, string>): void {
  api = authenticatedApi
  seededApi = authenticatedApi
  values = new Map(Object.entries(seeded))
  notify()
}

/** Loads the signed-in user's preferences; never rejects (a failed load keeps the seeded values or defaults, writes still go to the server). */
export async function hydrateUserPreferences(authenticatedApi: RpcStub<AuthenticatedApi>): Promise<void> {
  api = authenticatedApi
  hydrating = true
  try {
    const next = new Map(Object.entries(await authenticatedApi.getUiPreferences()))
    for (const [key, value] of pendingWrites) {
      if (value === null) next.delete(key)
      else next.set(key, value)
    }
    values = next
    writeBootSnapshot({ preferences: Object.fromEntries(next) })
  } catch (err) {
    logRpcFailure('Failed to load UI preferences:', err)
    if (seededApi !== authenticatedApi) values = new Map()
  }
  hydrating = false
  pendingWrites.clear()
  notify()
}

/** Current value of a preference, or null. */
export function readUserPreference(key: string): string | null {
  return values.get(key) ?? null
}

/** Sets (null deletes) locally at once and writes through; a failed write is logged, the local value stays. */
export function writeUserPreference(key: string, value: string | null): void {
  if ((values.get(key) ?? null) === value) return
  const next = new Map(values)
  if (value === null) next.delete(key)
  else next.set(key, value)
  values = next
  if (hydrating) pendingWrites.set(key, value)
  writeBootSnapshot({ preferences: Object.fromEntries(next) })
  notify()
  if (api) {
    void Promise.resolve(api.setUiPreference(key, value)).catch((err: unknown) =>
      logRpcFailure('Failed to save UI preference:', err),
    )
  }
}

/** Subscribes a component to one preference. */
export function useUserPreference(key: string): string | null {
  return useSyncExternalStore(subscribe, () => values.get(key) ?? null)
}
