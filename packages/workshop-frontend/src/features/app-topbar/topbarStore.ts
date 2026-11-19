import { useSyncExternalStore } from 'react'
import type { AppTopbarAction, AppTopbarControl } from '@gadgets/workshop-shared/app-host'

/**
 * The topbar controls each open gatekeeper app publishes (GatekeeperAppHost.setTopbar), one slot per
 * app id owned by the frame's host session, so a late teardown of an old frame never clears a newer one.
 * `activate` hands a use of a control (with the trigger's viewport rect) to the frame.
 */
type Activate = (id: string, action: AppTopbarAction, trigger: DOMRect) => void

type Slot = { owner: object; controls: AppTopbarControl[]; json: string; activate: Activate }

const NONE: AppTopbarControl[] = []
const slots = new Map<string, Slot>()
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A frame's host session started: it owns the app's slot from now on. */
export function attachAppTopbar(appId: string, owner: object, activate: Activate) {
  slots.set(appId, { owner, controls: NONE, json: '[]', activate })
  notify()
}

/** A frame's host session ended; only its own slot is cleared. */
export function detachAppTopbar(appId: string, owner: object) {
  if (slots.get(appId)?.owner !== owner) return
  slots.delete(appId)
  notify()
}

/** Store sanitized controls; unchanged payloads do not re-render the chrome. */
export function publishAppTopbar(appId: string, owner: object, controls: AppTopbarControl[]) {
  const slot = slots.get(appId)
  if (slot?.owner !== owner) return
  const json = JSON.stringify(controls)
  if (json === slot.json) return
  slot.controls = controls.length > 0 ? controls : NONE
  slot.json = json
  notify()
}

/** Hand a use of a control to the app. */
export function activateAppTopbar(appId: string, id: string, action: AppTopbarAction, trigger: DOMRect) {
  slots.get(appId)?.activate(id, action, trigger)
}

/** The controls the app currently publishes (empty when none). */
export function useAppTopbar(appId: string | null): AppTopbarControl[] {
  const read = () => (appId ? slots.get(appId)?.controls : undefined) ?? NONE
  return useSyncExternalStore(subscribe, read, read)
}
