import { useCallback, useEffect, useRef, useState } from 'react'
import type { GatekeeperUiFrame } from '@gadgets/workshop-shared/gatekeeper'
import { isAppFrameUrl, type AppRouteMode } from '@gadgets/workshop-shared/app-host'
import { useAuthenticatedApi } from './AuthContext'
import SandboxedGatekeeperApp, { type AppFrameDocument } from './SandboxedGatekeeperApp'
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

// The frame URL of the app's last acquisition. The next visit loads that document right away, in
// parallel with acquiring the frame; its handshake waits for the frame's `ui` capability.
const frameUrlKey = (appId: string) => `gadgets:app-frame-url:${appId}`
// The key of the document loaded before acquisition; the first acquired frame with the same URL keeps it.
const SPECULATIVE_DOCUMENT_KEY = 'speculative'
let nextDocumentKey = 0

function rememberFrameUrl(appId: string, url: string | null): void {
  try {
    if (url) localStorage.setItem(frameUrlKey(appId), url)
    else localStorage.removeItem(frameUrlKey(appId))
  } catch {
    /* storage unavailable: the next visit waits for the frame */
  }
}

function readFrameUrl(appId: string): string | null {
  try {
    const url = localStorage.getItem(frameUrlKey(appId))
    return url && isAppFrameUrl(url, appId) ? url : null
  } catch {
    return null
  }
}

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
  // treat a stored value as an updater function. Every acquired frame gets its own document key.
  const [state, setState] = useState<{ frame: GatekeeperUiFrame, documentKey: string } | null>(null)
  const [speculativeUrl] = useState(() => readFrameUrl(appId))
  // Whether a frame was acquired yet: only the first may adopt the speculative document.
  const adoptedRef = useRef(false)
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
          rememberFrameUrl(appId, null)
          if (!cancelled) setError(UNAVAILABLE)
          return
        }
        if (frame.iframeUrl !== undefined && !isAppFrameUrl(frame.iframeUrl, appId)) {
          disposeFrame(frame)
          rememberFrameUrl(appId, null)
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
        rememberFrameUrl(appId, frame.iframeUrl ?? null)
        // A first frame at the URL already loading keeps that document (its held handshake connects);
        // any other frame loads a fresh document, which is how a new capability reaches the app.
        const adopt = !adoptedRef.current && frame.iframeUrl !== undefined && frame.iframeUrl === speculativeUrl
        adoptedRef.current = true
        setState({ frame, documentKey: adopt ? SPECULATIVE_DOCUMENT_KEY : `frame-${++nextDocumentKey}` })
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
  }, [authenticatedApi, appId, generation, speculativeUrl])

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
    if (!speculativeUrl) return <div className="px-4 py-16 text-center text-sm text-kumo-subtle">Loading…</div>
    return (
      <div className="h-full">
        <SandboxedGatekeeperApp frame={null} frameDocument={{ iframeUrl: speculativeUrl }} documentKey={SPECULATIVE_DOCUMENT_KEY} gatekeeperVendorId={appId} route={route} visible={visible} onRouteChange={onRouteChange} onCapabilityLost={onCapabilityLost} />
      </div>
    )
  }
  const frameDocument: AppFrameDocument = state.frame.iframeUrl !== undefined
    ? { iframeUrl: state.frame.iframeUrl }
    : { iframeHtml: state.frame.iframeHtml ?? '' }

  // Fill the routed area below the header so the embedded app can manage its own internal layout.
  return (
    <div className="h-full">
      <SandboxedGatekeeperApp frame={state.frame} frameDocument={frameDocument} documentKey={state.documentKey} gatekeeperVendorId={appId} route={route} visible={visible} onRouteChange={onRouteChange} onCapabilityLost={onCapabilityLost} />
    </div>
  )
}
