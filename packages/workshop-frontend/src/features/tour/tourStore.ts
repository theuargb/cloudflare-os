import { useSyncExternalStore } from 'react'
import type { Tour, TourRect } from '@gadgets/workshop-shared/tour'

/** Where a tour may run: the home page, or a gatekeeper app's route while it is on screen. */
export type TourRoute = { kind: 'home' } | { kind: 'app'; appId: string }

/** Finds a frame anchor in host viewport px (null when absent); `reveal` scrolls it into view. */
export type LocateFrame = (anchor: string, reveal: boolean) => Promise<TourRect | null>

/**
 * A tour asked to run. `key` names it in the user's progress; `replay` runs it even when finished.
 * `locateFrame` is the app frame's anchor lookup (null for host-only tours).
 */
export type TourRequest = {
  key: string
  tour: Tour
  route: TourRoute
  replay: boolean
  locateFrame: LocateFrame | null
}

export type TourState = { pending: readonly TourRequest[]; active: TourRequest | null }

// Module-level so the app frame bridge, the user menu and the shell reach the same tours without a
// context wrapping all of them.
let state: TourState = { pending: [], active: null }
const listeners = new Set<() => void>()

const update = (next: TourState) => {
  state = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Queue a tour; a newer request replaces a pending one with the same key. */
export const requestTour = (request: TourRequest): void => {
  if (state.active?.key === request.key) return
  update({ ...state, pending: [...state.pending.filter((item) => item.key !== request.key), request] })
}

export const activateTour = (key: string): void => {
  const request = state.pending.find((item) => item.key === key)
  if (!request || state.active) return
  update({ pending: state.pending.filter((item) => item !== request), active: request })
}

export const discardTour = (key: string): void => {
  update({ ...state, pending: state.pending.filter((item) => item.key !== key) })
}

export const finishTour = (): void => {
  if (state.active) update({ ...state, active: null })
}

/** Forget the tours of an app whose frame session ended: they can no longer find their anchors. */
export const dropAppTours = (appId: string): void => {
  const ofApp = (request: TourRequest) => request.route.kind === 'app' && request.route.appId === appId
  const active = state.active && ofApp(state.active) ? null : state.active
  const pending = state.pending.filter((item) => !ofApp(item))
  if (active !== state.active || pending.length !== state.pending.length) update({ pending, active })
}

export const useTourState = (): TourState => useSyncExternalStore(subscribe, () => state)

export const routeMatches = (route: TourRoute, pathname: string): boolean =>
  route.kind === 'home' ? pathname === '/' : pathname === `/gatekeepers/${route.appId}`
