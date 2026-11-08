import { useSyncExternalStore } from 'react'

/**
 * The screen title each open gatekeeper app publishes (GatekeeperAppHost.setTitle), one slot per app id
 * owned by the frame's host session, so a late teardown of an old frame never clears a newer one. The
 * slot keeps the app route the title was published on: a route pushed into the app by the Workshop
 * shows no title until the app publishes the new screen's one.
 */
type Slot = { owner: object; title: string | null; route: string }

const slots = new Map<string, Slot>()
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function owned(appId: string, owner: object): Slot | null {
  const slot = slots.get(appId)
  return slot?.owner === owner ? slot : null
}

/** A frame's host session started: it owns the app's slot from now on. */
export function attachAppTitle(appId: string, owner: object) {
  slots.set(appId, { owner, title: null, route: '' })
  notify()
}

/** A frame's host session ended; only its own slot is cleared. */
export function detachAppTitle(appId: string, owner: object) {
  if (!owned(appId, owner)) return
  slots.delete(appId)
  notify()
}

/** Store a sanitized title published on app route `route`; unchanged values do not re-render the chrome. */
export function publishAppTitle(appId: string, owner: object, title: string | null, route: string) {
  const slot = owned(appId, owner)
  if (!slot || (slot.title === title && slot.route === route)) return
  slot.title = title
  slot.route = route
  notify()
}

/** The app reported its own navigation to `route`: the published title follows it (the app may publish before or after reporting). */
export function followAppTitle(appId: string, owner: object, route: string) {
  const slot = owned(appId, owner)
  if (!slot || slot.route === route) return
  slot.route = route
  notify()
}

/** The title the app published for the screen at `route` (null when none, or when the route was pushed into the app). */
export function useAppTitle(appId: string, route: string): string | null {
  const read = () => {
    const slot = slots.get(appId)
    return slot && slot.route === route ? slot.title : null
  }
  return useSyncExternalStore(subscribe, read, read)
}
