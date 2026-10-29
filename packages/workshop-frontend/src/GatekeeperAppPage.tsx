import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatekeeperUiFrame } from '@gadgets/workshop-shared/gatekeeper'
import { isAppFrameUrl, type AppRouteMode } from '@gadgets/workshop-shared/app-host'
import { useAuthenticatedApi } from './AuthContext'
import SandboxedGatekeeperApp from './SandboxedGatekeeperApp'
import { reportDoResetError } from './rpcErrors'
import { reportIssue } from './errorReporting'

// The frame's `ui` is an RPC stub at runtime; dispose it to release the server-side capability.
function disposeFrame(frame: GatekeeperUiFrame | null) {
  (frame?.ui as { [Symbol.dispose]?(): void } | undefined)?.[Symbol.dispose]?.()
}

const UNAVAILABLE = 'This app is not available on this deployment.'

// A fresh frame is never replaced sooner than this after it was acquired, so a backend that keeps
// failing reloads the app at most every 10 s instead of looping.
const FRAME_REACQUIRE_MIN_INTERVAL_MS = 10_000

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
  // Bumped to fetch a fresh frame when the current one's server-side capability died.
  const [generation, setGeneration] = useState(0)
  const currentFrameRef = useRef<GatekeeperUiFrame | null>(null)
  const acquiredAtRef = useRef(0)
  const reacquireTimerRef = useRef<number | null>(null)

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
        setError(null);
        acquired = frame
        currentFrameRef.current = frame
        acquiredAtRef.current = Date.now()
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
      // Errors from the outgoing frame must not schedule another re-acquire.
      currentFrameRef.current = null
      if (reacquireTimerRef.current !== null) {
        window.clearTimeout(reacquireTimerRef.current)
        reacquireTimerRef.current = null
      }
    }
  }, [authenticatedApi, appId, generation])

  const onCapabilityLost = useCallback((frame: GatekeeperUiFrame, error: unknown) => {
    if (frame !== currentFrameRef.current || reacquireTimerRef.current !== null) return
    console.warn('Gatekeeper app capability lost; reopening the app:', error)
    reportDoResetError('gatekeeper-app', error)
    const delay = Math.max(0, acquiredAtRef.current + FRAME_REACQUIRE_MIN_INTERVAL_MS - Date.now())
    reacquireTimerRef.current = window.setTimeout(() => {
      reacquireTimerRef.current = null
      setGeneration((g) => g + 1)
    }, delay)
  }, [])

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
      <SandboxedGatekeeperApp frame={state.frame} gatekeeperVendorId={appId} route={route} visible={visible} onRouteChange={onRouteChange} onCapabilityLost={onCapabilityLost} />
    </div>
  )
}
