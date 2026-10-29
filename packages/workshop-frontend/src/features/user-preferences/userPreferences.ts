// The signed-in user's UI preferences (sidebar layout, finished tours, gatekeeper app preferences),
// kept per user on the server. Loaded once before the shell renders, then held in memory and
// written through key by key, so every browser of the user shows the same state.

import { useSyncExternalStore } from 'react'
import type { RpcStub } from 'capnweb'
import type { AuthenticatedApi } from '@gadgets/workshop-shared/api'
import { logRpcFailure } from '../../rpcErrors'

let api: RpcStub<AuthenticatedApi> | null = null
let values: ReadonlyMap<string, string> = new Map()
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

/** Loads the signed-in user's preferences; never rejects (a failed load keeps defaults, writes still go to the server). */
export async function hydrateUserPreferences(authenticatedApi: RpcStub<AuthenticatedApi>): Promise<void> {
  api = authenticatedApi
  try {
    values = new Map(Object.entries(await authenticatedApi.getUiPreferences()))
  } catch (err) {
    logRpcFailure('Failed to load UI preferences:', err)
    values = new Map()
  }
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
