/**
 * Navigation intent → app preload. A pointer resting on (or focus on) a row that opens an app route
 * asks the app's live frame to warm that route (GatekeeperAppRouteReceiver.preloadRoute), so the
 * screen is mostly loaded by the time the click lands. Only a frame that is already running is
 * asked; one slot per app id, owned by the frame's host object (a reloaded frame takes it over, a
 * late detach of the old one is a no-op).
 */

/** How long the pointer rests before the preload is sent: a sweep across the sidebar sends none. */
const INTENT_DELAY_MS = 80

type Slot = { owner: object; preload: (route: string) => void }

const slots = new Map<string, Slot>()

/** A frame's host started its route channel: it preloads the app's routes from now on. */
export function attachAppPreload(appId: string, owner: object, preload: (route: string) => void): void {
  slots.set(appId, { owner, preload })
}

/** A frame's host ended; only its own slot is cleared. */
export function detachAppPreload(appId: string, owner: object): void {
  if (slots.get(appId)?.owner === owner) slots.delete(appId)
}

/** Warm `route` of app `appId` if its frame is running; otherwise nothing. */
export function preloadAppRoute(appId: string, route: string): void {
  slots.get(appId)?.preload(route)
}

/** Calls `preload` once the user has rested on a target for a moment; returns the cancel. */
export function schedulePreload(preload: () => void): () => void {
  const timer = window.setTimeout(preload, INTENT_DELAY_MS)
  return () => window.clearTimeout(timer)
}

/** Pointer/focus handlers that call `preload` once the pointer rests on the element (focus: at once). */
export function preloadIntent(preload: () => void): {
  onPointerEnter: () => void
  onPointerLeave: () => void
  onFocus: () => void
} {
  let cancel: (() => void) | undefined
  return {
    onPointerEnter: () => {
      cancel?.()
      cancel = schedulePreload(preload)
    },
    onPointerLeave: () => cancel?.(),
    onFocus: preload,
  }
}
