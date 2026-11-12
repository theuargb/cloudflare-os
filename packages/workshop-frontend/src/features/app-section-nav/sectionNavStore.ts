import { useSyncExternalStore } from 'react'
import type { RpcStub } from 'capnweb'
import { appRouteEntry, type AppSectionNav, type GatekeeperAppSectionNavReceiver } from '@gadgets/workshop-shared/app-host'

/**
 * The live section navigation each open gatekeeper app publishes (GatekeeperAppHost.setSectionNav),
 * read by the sidebar tree and the topbar type menus (the open module). One slot per app id, owned by
 * the frame's host object: a reloaded frame's new host takes the slot over, and a late dispose of the
 * old one is a no-op. The slot also keeps the app entry of the route the navigation belongs to, so a
 * sidebar row of another entry of the same app never shows it while the app is still switching.
 */
type Slot = {
  owner: object
  nav: AppSectionNav | null
  json: string
  /** `appRouteEntry` of the app route the navigation was published on (null = the first entry). */
  entry: string | null
  receiver: RpcStub<GatekeeperAppSectionNavReceiver> | null
}

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
  return slot && slot.owner === owner ? slot : null
}

/** Call the app's receiver; a failed call drops it (the frame is gone or its session ended). */
function callReceiver(slot: Slot, call: (receiver: RpcStub<GatekeeperAppSectionNavReceiver>) => unknown) {
  const receiver = slot.receiver
  if (!receiver) return
  const drop = () => {
    if (slot.receiver !== receiver) return
    receiver[Symbol.dispose]?.()
    slot.receiver = null
  }
  try {
    Promise.resolve(call(receiver)).catch(drop)
  } catch {
    drop()
  }
}

/** A frame's host session started: it owns the app's slot from now on. */
export function attachAppSectionNav(appId: string, owner: object) {
  slots.set(appId, { owner, nav: null, json: 'null', entry: null, receiver: null })
  notify()
}

/** A frame's host session ended; only its own slot is cleared. */
export function detachAppSectionNav(appId: string, owner: object) {
  if (!owned(appId, owner)) return
  slots.delete(appId)
  notify()
}

/** Store a sanitized navigation published on app route `route`; unchanged payloads do not re-render the chrome. */
export function publishAppSectionNav(appId: string, owner: object, nav: AppSectionNav | null, route: string) {
  const slot = owned(appId, owner)
  if (!slot) return
  const json = JSON.stringify(nav)
  const entry = appRouteEntry(route)
  if (json === slot.json && entry === slot.entry) return
  slot.nav = nav
  slot.json = json
  slot.entry = entry
  notify()
}

/**
 * The app reported its own navigation to `route`: the published navigation follows it (the app may
 * publish before or after reporting). A route pushed into the app does not move it: the old screen's
 * navigation stays with its entry until the app publishes the new one.
 */
export function followAppSectionNav(appId: string, owner: object, route: string) {
  const slot = owned(appId, owner)
  const entry = appRouteEntry(route)
  if (!slot || slot.entry === entry) return
  slot.entry = entry
  notify()
}

/** The app's receiver for picks. */
export function setAppSectionNavReceiver(appId: string, owner: object, receiver: RpcStub<GatekeeperAppSectionNavReceiver>) {
  const slot = owned(appId, owner)
  if (slot) slot.receiver = receiver
}

/** Open a section of the app (a pick in the sidebar tree). */
export function selectAppSection(appId: string, id: string) {
  const slot = slots.get(appId)
  if (slot) callReceiver(slot, (receiver) => receiver.selectSection(id))
}

/**
 * The navigation the app currently publishes, or null. With `entry` (a sidebar row of one of the
 * app's entries), only while it was published on that entry.
 */
export function useAppSectionNav(appId: string | null, entry?: { id: string; first: boolean }): AppSectionNav | null {
  const read = () => {
    const slot = appId ? slots.get(appId) : undefined
    if (!slot?.nav) return null
    if (entry && slot.entry !== entry.id && !(slot.entry === null && entry.first)) return null
    return slot.nav
  }
  return useSyncExternalStore(subscribe, read, read)
}
