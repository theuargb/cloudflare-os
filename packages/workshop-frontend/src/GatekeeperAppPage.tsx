import { useEffect, useState } from 'react'
import type { GatekeeperUiFrame } from '@gadgets/workshop-shared/gatekeeper'
import { isAppFrameUrl, type AppRouteMode } from '@gadgets/workshop-shared/app-host'
import { useAuthenticatedApi } from './AuthContext'
import SandboxedGatekeeperApp from './SandboxedGatekeeperApp'
import { reportIssue } from './errorReporting'

// The frame's `ui` is an RPC stub at runtime; dispose it to release the server-side capability.
function disposeFrame(frame: GatekeeperUiFrame | null) {
  (frame?.ui as { [Symbol.dispose]?(): void } | undefined)?.[Symbol.dispose]?.()
}

const UNAVAILABLE = 'This app is not available on this deployment.'

/**
 * Renders a gatekeeper's full-page management app (a sandboxed SPA the gatekeeper serves).
 * Fetches the app frame (iframe HTML or URL + `ui` capability) from the backend and hosts it.
 */
export default function GatekeeperAppPage({ appId, route, visible, onRouteChange }: {
  appId: string,
  /** The app's own route from the Workshop URL ('' = start screen). */
  route: string,
  /** Whether the app is on screen (the shell keeps the last app mounted while hidden). */
  visible: boolean,
  onRouteChange: (route: string, mode: AppRouteMode) => void,
}) {
  const { authenticatedApi } = useAuthenticatedApi()
  // Wrap the frame in an object: it holds a `ui` RPC stub, and we never want useState's setter to
  // treat a stored value as an updater function.
  const [state, setState] = useState<{ frame: GatekeeperUiFrame } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let acquired: GatekeeperUiFrame | null = null
    authenticatedApi
      .getGatekeeperApp(appId)
      .then((frame) => {
        if (!frame) {
          if (!cancelled) setError(UNAVAILABLE)
          return
        }
        if (frame.iframeUrl !== undefined && !isAppFrameUrl(frame.iframeUrl, appId)) {
          disposeFrame(frame)
          reportIssue('gatekeeper-app.frame-url', new Error('App frame URL outside its gatekeeper path'), {
            gatekeeperVendorId: appId,
          })
          if (!cancelled) setError(UNAVAILABLE)
          return
        }
        if (cancelled) {
          disposeFrame(frame)
          return
        }
        acquired = frame
        setState({ frame })
      })
      .catch((err) => {
        console.error('Failed to load gatekeeper app:', err)
        reportIssue('gatekeeper-app.load', err, {
          gatekeeperVendorId: appId,
        })
        if (!cancelled) setError(`${err}`)
      })
    return () => {
      cancelled = true
      disposeFrame(acquired)
    }
  }, [authenticatedApi, appId])

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-sm text-kumo-subtle">{error}</div>
    )
  }
  if (!state) {
    return <div className="px-4 py-16 text-center text-sm text-kumo-subtle">Loading…</div>
  }

  // Fill the routed area below the header so the embedded app can manage its own internal layout.
  return (
    <div className="h-full">
      <SandboxedGatekeeperApp frame={state.frame} gatekeeperVendorId={appId} route={route} visible={visible} onRouteChange={onRouteChange} />
    </div>
  )
}
