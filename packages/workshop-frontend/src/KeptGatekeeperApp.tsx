import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { AppRouteMode } from '@gadgets/workshop-shared/app-host'
import GatekeeperAppPage from './GatekeeperAppPage'

/** The app the `/gatekeepers/$appId` route shows: its id and the app route from the URL (`at`). */
type ShownApp = { appId: string, route: string }

type KeptAppState = {
  /** The last app shown; it stays mounted (hidden) after the user leaves its route. */
  app: ShownApp | null,
  /** Whether the app route is on screen. */
  active: boolean,
  show: (app: ShownApp) => void,
  hide: () => void,
  /** Mounts `app` hidden when no app is kept yet. */
  warm: (app: ShownApp) => void,
}

const KeptAppContext = createContext<KeptAppState | null>(null)

function useKeptApp(): KeptAppState {
  const context = useContext(KeptAppContext)
  if (!context) throw new Error('KeptGatekeeperApp must be used within a KeptGatekeeperAppProvider')
  return context
}

/**
 * Holds the last opened gatekeeper app across Workshop routes, so returning to it from chat or any
 * other page shows it at once, at the screen it was left on, without reloading the frame.
 */
export function KeptGatekeeperAppProvider({ children }: { children: ReactNode }) {
  const [app, setApp] = useState<ShownApp | null>(null)
  const [active, setActive] = useState(false)
  const show = useCallback((next: ShownApp) => {
    setApp((current) => (current?.appId === next.appId && current.route === next.route ? current : next))
    setActive(true)
  }, [])
  const hide = useCallback(() => setActive(false), [])
  const warm = useCallback((next: ShownApp) => setApp((current) => current ?? next), [])
  return <KeptAppContext.Provider value={{ app, active, show, hide, warm }}>{children}</KeptAppContext.Provider>
}

/** Called by the app route: puts the app on screen at `route`, and takes it off screen on leave. */
export function useShowGatekeeperApp(appId: string, route: string): void {
  const { show, hide } = useKeptApp()
  useEffect(() => {
    show({ appId, route })
  }, [show, appId, route])
  useEffect(() => hide, [hide])
}

/**
 * Boots an app hidden at `route` before the user opens it (a sidebar module row was expanded), so
 * its frame, session and the route's code are ready when a page is picked. Only while no app is
 * kept: a kept app is never replaced off screen.
 */
export function useWarmGatekeeperApp(): (appId: string, route: string) => void {
  const { warm } = useKeptApp()
  return useCallback((appId: string, route: string) => warm({ appId, route }), [warm])
}

/**
 * The kept app, rendered by the shell over its content area. Switching to another app replaces it
 * (the page is keyed by app id); leaving the shell (sign-out, the fullscreen editor) unmounts it.
 */
export function KeptGatekeeperApp() {
  const { app, active } = useKeptApp()
  const navigate = useNavigate()
  const activeRef = useRef(active)
  activeRef.current = active
  const appId = app?.appId
  // Mirror the app's navigation into the URL while it is on screen: a new screen pushes a history
  // entry, a params-only change replaces it. A hidden app's navigation stays inside the app.
  const onRouteChange = useCallback((next: string, mode: AppRouteMode) => {
    if (!activeRef.current || !appId) return
    void navigate({
      to: '/gatekeepers/$appId',
      params: { appId },
      search: { at: next || undefined },
      replace: mode !== 'push',
    })
  }, [navigate, appId])
  if (!app) return null
  return (
    <div className={active ? 'absolute inset-0' : 'hidden'}>
      <GatekeeperAppPage key={app.appId} appId={app.appId} route={app.route} visible={active} onRouteChange={onRouteChange} />
    </div>
  )
}
