import { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { type RpcPromise, RpcStub, RpcTarget, newMessagePortRpcSession } from 'capnweb'
import { useNavigate, useRouter } from '@tanstack/react-router'
import type {
  GatekeeperUiFrame,
  GatekeeperUserSelectionReceiver,
} from '@gadgets/workshop-shared/gatekeeper'
import { isHexColor } from '@gadgets/workshop-shared/api'
import type {
  GatekeeperAppTheme,
  GatekeeperAppThemeReceiver,
} from '@gadgets/workshop-shared/theme'
import { isAppId, isAppRoute, type AppRouteMode, type GatekeeperAppRouteReceiver } from '@gadgets/workshop-shared/app-host'
import type { GatekeeperAppHost, GatekeeperAppTourLocator } from '@gadgets/workshop-shared/app-host'
import { sanitizeTour, type Tour } from "@gadgets/workshop-shared/tour";
import { locateInFrame } from "./features/tour/frameTarget";
import { dropAppTours, requestTour } from "./features/tour/tourStore";
import { sanitizeAppSectionNav, type GatekeeperAppSectionNavReceiver } from '@gadgets/workshop-shared/app-host'
import { openCommandPalette } from './components/AppShell/commandPaletteBus'
import { createRateLimitedCapability } from './rateLimitedCapability'
import { useTheme } from './ThemeContext'
import { useServerConfig } from './ServerConfigContext'
import { forwardTrustedFrameError } from './errorReporting'
import { classifyRpcError } from './rpcErrors'
import { useAuthenticatedApi } from './AuthContext'
import {
  normalizeGatekeeperAppPrompt,
  parseGatekeeperAppWorkspaceTarget,
  type GatekeeperAppWorkspaceTarget,
} from './gatekeeperAppNavigation'
import GatekeeperUserPickerDialog from './features/gatekeeper-sharing/GatekeeperUserPickerDialog'
import { readGatekeeperAppPreference, writeGatekeeperAppPreference } from './gatekeeperAppPreferences'
import { refreshGatekeeperApps } from './useGatekeeperApps'
import { revalidateAppNavigation } from './components/AppNavigation/useAppNavigation'
import {
  attachAppSectionNav,
  detachAppSectionNav,
  followAppSectionNav,
  publishAppSectionNav,
  setAppSectionNavReceiver,
} from './features/app-section-nav/sectionNavStore'
import { attachAppPreload, detachAppPreload } from './features/app-preload/appPreload'

// The content-pane rect, in viewport coordinates, that the app pins its page to while the iframe
// is full-viewport.
type OverlayRect = { left: number; top: number; width: number; height: number }

// The host's reply to a present/dismiss. On open, `rect` is where the app holds its page fixed while
// the iframe expands to full-viewport (null on restore); `willResize` is whether switching the iframe
// to/from full-viewport actually changes its pixel size (it won't if the pane already fills the window).
type PresentAck = { rect: OverlayRect | null; willResize: boolean }

// Grows the app's iframe to a full-viewport overlay for app-level modals (true) or restores it (false).
type PresentController = (active: boolean) => PresentAck
type OpenTarget = (target: GatekeeperAppWorkspaceTarget) => void
// Resolves workspace IDs the app already holds to their live titles; null for a workspace the user
// can no longer see. Deliberately a lookup, not an enumeration: the app learns nothing new.
type ResolveWorkspaceTitles = (ids: string[]) => Promise<(string | null)[]>
type OpenPrompt = (prompt: string) => void
// Opening throws synchronously if refused; returning transfers receiver ownership to the picker.
type OpenUserPicker = (receiver: RpcStub<GatekeeperUserSelectionReceiver>) => Promise<void>
type CancelUserPicker = () => void

type UserPicker = {
  id: number
  receiver: RpcStub<GatekeeperUserSelectionReceiver>
  deliveries: Set<RpcPromise<void>>
  resolve: () => void
}

const USER_PICKER_CANCELLED = 'Person selection cancelled. A delivery may already have been accepted.'

// Queue a validated tour of this app; the locator answers its frame anchor lookups.
type StartTour = (tour: Tour, locator: RpcStub<GatekeeperAppTourLocator>, replay: boolean) => void;
// The app's route as mirrored in the Workshop URL ('' = the app's start screen), navigation to
// another app's route (an inbox card, a cross-module link), here or in a new browser tab, and a
// refetch of the user's apps and navigation.
type AppRouting = {
  current: () => string,
  report: (route: string, mode: AppRouteMode) => void,
  openApp: (appId: string, route: string, newTab: boolean) => void,
  refreshNavigation: () => void,
}

type OverlayState = 'full' | null

// Upper bound on one workspace-title lookup, matching the app's page size.
const MAX_RESOLVED_WORKSPACES = 100

// Reported routes the Workshop URL has not shown yet; bounded while the app reports but is hidden.
const MAX_UNSEEN_ROUTES = 32

// Apps may ask for a navigation refetch at most this often (each one fans out to every app).
const REFRESH_NAVIGATION_INTERVAL_MS = 2000

// How long one gadget listing is reused across title lookups. The untrusted frame calls this once
// per page of rows (and could call it in a loop), so the listing is shared rather than repeated.
const WORKSPACE_TITLES_TTL_MS = 10_000

// Near the max int, so the full-viewport iframe sits above all Workshop chrome.
const overlayZIndex = 2147483000

// Each acquired frame gets its own iframe document: an already-loaded app handshakes once, so a
// fresh `ui` capability (e.g. after the Workshop socket reconnected) is reachable only through a
// reloaded document. Identity-keyed, so re-renders with the same frame never reload the app.
const frameKeys = new WeakMap<GatekeeperUiFrame, number>();
let nextFrameKey = 0;
function frameKey(frame: GatekeeperUiFrame): number {
  let key = frameKeys.get(frame);
  if (key === undefined) {
    key = ++nextFrameKey;
    frameKeys.set(frame, key);
  }
  return key;
}

const baseIframeStyle: CSSProperties = {
  border: 0,
  background: 'transparent',
}

function iframeStyleForOverlay(overlay: OverlayState): CSSProperties {
  if (overlay === 'full') {
    return {
      ...baseIframeStyle,
      position: 'fixed',
      top: 'calc(var(--app-top) + env(safe-area-inset-top))',
      right: 'env(safe-area-inset-right)',
      bottom: 'calc(var(--app-bottom) + env(safe-area-inset-bottom))',
      left: 'env(safe-area-inset-left)',
      width: 'calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right))',
      height: 'calc(100vh - var(--app-top) - var(--app-bottom) - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
      zIndex: overlayZIndex,
    }
  }
  return {
    ...baseIframeStyle,
    display: 'block',
    width: '100%',
    height: '100%',
  }
}

// The host capability exposed to the sandboxed app (the gatekeeper's iframe UI) over the MessagePort
// RPC session. The app uses `ui` to reach the gatekeeper's own capability, which Workshop relays and
// rate-limits. `setPresenting` stays in Workshop and only grows/restores the iframe's layout.
class GatekeeperAppHostImpl extends RpcTarget implements GatekeeperAppHost {
  readonly #ui: RpcStub<RpcTarget>
  readonly #disposeRateLimiter: () => void
  readonly #present: PresentController
  readonly #openTarget: OpenTarget
  readonly #openPrompt: OpenPrompt
  readonly #resolveWorkspaceTitles: ResolveWorkspaceTitles
  readonly #openUserPicker: OpenUserPicker
  readonly #cancelUserPicker: CancelUserPicker
  readonly #routing: AppRouting
  readonly #startTour: StartTour;
  #tourLocator: RpcStub<GatekeeperAppTourLocator> | null = null;
  readonly #appId: string
  #sectionNavReceiver: RpcStub<GatekeeperAppSectionNavReceiver> | null = null
  #presenting = false
  #theme: GatekeeperAppTheme
  #themeReceiver: RpcStub<GatekeeperAppThemeReceiver> | null = null
  #routeReceiver: RpcStub<GatekeeperAppRouteReceiver> | null = null
  // The app's current route as far as the host knows (reported by the app or pushed to it).
  #route = ''
  // Routes the app reported that the Workshop URL has not shown yet, oldest first. Replace
  // navigations coalesce, so the URL may skip some; an echo is never pushed back (see pushRoute).
  #unseen: string[] = []
  #lastRefresh = 0
  // Presentation changes are coalesced to a single apply per animation frame (see #applyPending).
  #pendingActive: boolean | null = null
  #pendingResolvers: ((ack: PresentAck) => void)[] = []
  #frameId: number | null = null

  constructor(
    capability: unknown,
    present: PresentController,
    theme: GatekeeperAppTheme,
    openTarget: OpenTarget,
    openPrompt: OpenPrompt,
    resolveWorkspaceTitles: ResolveWorkspaceTitles,
    openUserPicker: OpenUserPicker,
    cancelUserPicker: CancelUserPicker,
    routing: AppRouting,
    startTour: StartTour,
    appId: string,
  ) {
    super()
    this.#theme = theme
    const { capability: ui, dispose } = createRateLimitedCapability(capability, {
      maxConcurrency: 8,
      maxCallsPerMinute: 600,
      maxPendingCalls: 128,
      onRateLimit: 'throttle',
      label: 'Gatekeeper app',
    })
    this.#ui = ui
    this.#disposeRateLimiter = dispose
    this.#present = present
    this.#openTarget = openTarget
    this.#openPrompt = openPrompt
    this.#resolveWorkspaceTitles = resolveWorkspaceTitles
    this.#openUserPicker = openUserPicker
    this.#cancelUserPicker = cancelUserPicker
    this.#routing = routing
    this.#startTour = startTour;
    this.#appId = appId
    attachAppSectionNav(appId, this)
  }

  get ui(): RpcStub<RpcTarget> {
    return this.#ui
  }

  // Navigate to a workspace the app knows about. The IDs are validated here because the app is
  // untrusted; navigation stays in-app rather than handing the frame a URL to follow.
  openWorkspace(workspaceId: string, gadgetId?: number): void {
    this.#openTarget(parseGatekeeperAppWorkspaceTarget(workspaceId, gadgetId))
  }

  // Resolve live titles for workspaces the app already references, so it never renders a stale
  // snapshot. Bounded per call; unknown or no-longer-visible workspaces come back as null.
  resolveWorkspaceTitles(ids: string[]): Promise<(string | null)[]> {
    if (!Array.isArray(ids) || ids.length > MAX_RESOLVED_WORKSPACES) {
      throw new TypeError('Invalid workspace title lookup.')
    }
    return this.#resolveWorkspaceTitles(ids)
  }

  openPrompt(prompt: string): void {
    this.#openPrompt(normalizeGatekeeperAppPrompt(prompt))
  }

  // Open the trusted Workshop-owned person picker over the app. The directory search happens in the
  // parent, and the Workshop mints a single-use ticket for each person the user selects
  // (AuthenticatedApi.createGatekeeperUserSelection) and delivers it to `receiver.receive()` — to
  // the iframe, not to the gatekeeper's server. The app decides what a selection is for: it can send
  // the ticket to its backend at once, or hold it in form state and submit it later, while it is
  // valid. The promise resolves when the picker closes: after every delivery has settled, or
  // immediately on cancellation, when deliveries may still be running. Frame teardown also
  // cancels, but the app then sees its connection close instead. Cancellation cannot undo a
  // delivery the app may already have accepted. Otherwise it stays pending while open (no timeout).
  // Only one picker can be open at a time.
  selectUsers(receiver: RpcStub<GatekeeperUserSelectionReceiver>): Promise<void> {
    if (typeof receiver?.dup !== 'function') {
      return Promise.reject(new TypeError('selectUsers requires a receiver capability.'))
    }
    // The argument stub is disposed when this call returns. Opening transfers this dup to the
    // picker, which releases it on close or cancellation; only an opening failure releases it here.
    const retained = receiver.dup()
    try {
      return this.#openUserPicker(retained)
    } catch (error) {
      retained[Symbol.dispose]()
      return Promise.reject(error)
    }
  }

  // UI preferences shared across gatekeeper apps, persisted by Workshop (see gatekeeperAppPreferences).
  getAppPreference(key: string): string | null {
    return readGatekeeperAppPreference(key)
  }

  setAppPreference(key: string, value: string): void {
    writeGatekeeperAppPreference(key, value)
  }

  // Validated here: the tour comes from the untrusted app. The host decides whether it runs (once
  // per user and version, only while the app is on screen); the frame only answers anchor lookups.
  startTour(tour: unknown, locator: RpcStub<GatekeeperAppTourLocator>, replay?: unknown): void {
    const clean = sanitizeTour(tour);
    if (!clean || (replay !== undefined && typeof replay !== "boolean")) throw new TypeError("Invalid tour.");
    this.#tourLocator?.[Symbol.dispose]?.();
    // The argument stub is disposed when this call returns, so keep our own dup (released in dispose).
    this.#tourLocator = locator.dup();
    this.#startTour(clean, this.#tourLocator, replay === true);
  }

  // The app calls this once to learn the current theme and register a receiver for later changes.
  // Apps that don't theme themselves never call it.
  subscribeTheme(receiver: RpcStub<GatekeeperAppThemeReceiver>): GatekeeperAppTheme {
    this.#themeReceiver?.[Symbol.dispose]?.()
    // The argument stub is disposed when this call returns, so keep our own dup (released in dispose).
    this.#themeReceiver = receiver.dup()
    return this.#theme
  }

  #dropThemeReceiver(receiver: RpcStub<GatekeeperAppThemeReceiver>) {
    if (this.#themeReceiver !== receiver) return
    receiver[Symbol.dispose]?.()
    this.#themeReceiver = null
  }

  // Push a new theme to a subscribed app; a no-op until (and unless) the app subscribes.
  updateTheme(theme: GatekeeperAppTheme) {
    this.#theme = theme
    const receiver = this.#themeReceiver
    if (!receiver) return

    try {
      Promise.resolve(receiver.setTheme(theme)).catch(() => this.#dropThemeReceiver(receiver))
    } catch {
      this.#dropThemeReceiver(receiver)
    }
  }

  // The app calls this once on start: registers for Workshop-side navigation and learns the route
  // to open (from the Workshop URL, so reloads and shared links restore the screen).
  subscribeRoute(receiver: RpcStub<GatekeeperAppRouteReceiver>): string {
    this.#routeReceiver?.[Symbol.dispose]?.()
    this.#routeReceiver = receiver.dup()
    attachAppPreload(this.#appId, this, (route) => this.#preloadRoute(route))
    this.#route = this.#routing.current()
    this.#unseen = []
    return this.#route
  }

  // The app reports each in-app navigation; the Workshop mirrors it into its URL, adding a history
  // entry for `push` (a new screen) and replacing the current one otherwise.
  reportRoute(route: string, mode?: unknown): void {
    if (!isAppRoute(route) || (mode !== undefined && mode !== 'push' && mode !== 'replace')) {
      throw new TypeError('Invalid app route.')
    }
    if (route === this.#route) return
    this.#route = route
    followAppSectionNav(this.#appId, this, route)
    this.#unseen = [...this.#unseen.slice(1 - MAX_UNSEEN_ROUTES), route]
    this.#routing.report(route, mode ?? 'replace')
  }

  // The Workshop URL shows `route` (every change while the app is on screen, and once more when it
  // comes back on screen). A route the app reported is its own echo: consume the queue up to it.
  // Anything else (sidebar row, launcher pick, Back/Forward, app link) is pushed into the open app.
  pushRoute(route: string) {
    const index = this.#unseen.indexOf(route)
    if (index >= 0) {
      this.#unseen = this.#unseen.slice(index + 1)
      return
    }
    this.#unseen = []
    const receiver = this.#routeReceiver
    if (!receiver || route === this.#route) return
    this.#route = route
    try {
      Promise.resolve(receiver.setRoute(route)).catch(() => this.#dropRouteReceiver(receiver))
    } catch {
      this.#dropRouteReceiver(receiver)
    }
  }

  #dropRouteReceiver(receiver: RpcStub<GatekeeperAppRouteReceiver>) {
    if (this.#routeReceiver !== receiver) return
    receiver[Symbol.dispose]?.()
    this.#routeReceiver = null
  }

  // Navigation intent on a row that opens `route` (sidebar, launcher): a hint to the app, never
  // awaited. A stub exposes every method name, so the optional one is called as present; an app
  // without `preloadRoute` rejects the call, which keeps its route channel intact.
  #preloadRoute(route: string) {
    const receiver = this.#routeReceiver as RpcStub<Required<GatekeeperAppRouteReceiver>> | null
    if (!receiver || !isAppRoute(route) || route === this.#route) return
    try {
      Promise.resolve(receiver.preloadRoute(route)).catch(() => {})
    } catch {
      // The frame is gone; setRoute drops the receiver on the next navigation.
    }
  }

  // The app changed what the user sees (e.g. its areas): refetch apps and navigation, throttled
  // because the untrusted frame could call this in a loop.
  refreshNavigation(): void {
    const now = Date.now()
    if (now - this.#lastRefresh < REFRESH_NAVIGATION_INTERVAL_MS) return
    this.#lastRefresh = now
    this.#routing.refreshNavigation()
  }

  // The app registers for picks made in the Workshop's section navigation (sidebar tree).
  subscribeSectionNav(receiver: RpcStub<GatekeeperAppSectionNavReceiver>): void {
    this.#sectionNavReceiver?.[Symbol.dispose]?.()
    // The argument stub is disposed when this call returns, so keep our own dup (released in dispose).
    this.#sectionNavReceiver = receiver.dup()
    setAppSectionNavReceiver(this.#appId, this, this.#sectionNavReceiver)
  }

  // The open screen's navigation, validated here (the app is untrusted), kept with the route it is on.
  setSectionNav(nav: unknown): void {
    publishAppSectionNav(this.#appId, this, sanitizeAppSectionNav(nav), this.#route)
  }

  // Keystrokes inside the iframe never reach the Workshop, so the app forwards ⌘K here.
  openSearch(): void {
    openCommandPalette()
  }

  // Open another gatekeeper app at a route, optionally in a new browser tab (the sandboxed frame
  // cannot open windows). All parts are validated: the app is untrusted.
  openApp(appId: string, route: string, newTab?: unknown): void {
    if (!isAppId(appId) || !isAppRoute(route) || (newTab !== undefined && typeof newTab !== 'boolean')) throw new TypeError('Invalid app link.')
    this.#routing.openApp(appId, route, newTab === true)
  }

  // A module whose definitions changed under the open page asks for a fresh Workshop load; the frame
  // cannot reload itself (a second handshake invalidates the session).
  reloadPage(): void {
    window.location.reload()
  }

  // Queue a presentation change; the latest requested state is applied on the next frame.
  setPresenting(active: boolean): Promise<PresentAck> {
    return new Promise((resolve) => {
      this.#pendingActive = active
      this.#pendingResolvers.push(resolve)
      this.#frameId ??= requestAnimationFrame(() => this.#applyPending())
    })
  }

  // Apply the last-requested state once, resolving every caller queued this frame with the result.
  #applyPending() {
    this.#frameId = null
    const active = this.#pendingActive!
    const resolvers = this.#pendingResolvers
    this.#pendingActive = null
    this.#pendingResolvers = []
    // No-op toggles skip the layout apply.
    const ack: PresentAck =
      active === this.#presenting ? { rect: null, willResize: false } : this.#present(active)
    this.#presenting = active
    for (const resolve of resolvers) resolve(ack)
  }

  // Restore the iframe from a full-viewport overlay and settle queued presentation calls: on dispose,
  // and when the app leaves the screen (kept mounted but hidden) so its overlay never covers others.
  suspendPresentation() {
    if (this.#frameId !== null) {
      cancelAnimationFrame(this.#frameId)
      this.#frameId = null
    }
    for (const resolve of this.#pendingResolvers) resolve({ rect: null, willResize: false })
    this.#pendingResolvers = []
    this.#pendingActive = null
    if (this.#presenting) {
      this.#presenting = false
      this.#present(false)
    }
  }

  // Cancel the rate limiter's pending resume timer once this host is no longer in use.
  dispose() {
    this.#disposeRateLimiter()
    this.#cancelUserPicker()
    this.#themeReceiver?.[Symbol.dispose]?.()
    this.#themeReceiver = null
    this.#tourLocator?.[Symbol.dispose]?.();
    this.#tourLocator = null;
    this.#routeReceiver?.[Symbol.dispose]?.()
    this.#routeReceiver = null
    detachAppSectionNav(this.#appId, this)
    detachAppPreload(this.#appId, this)
    this.#sectionNavReceiver?.[Symbol.dispose]?.()
    this.#sectionNavReceiver = null
    this.suspendPresentation()
  }
}

/**
 * Hosts a gatekeeper's full-page management SPA in a sandboxed, network-isolated iframe. The app
 * talks to the gatekeeper only through the `ui` capability carried over the MessagePort RPC session.
 * The iframe fills its parent container; a hidden app stays loaded (kept mounted by the shell).
 */
export default function SandboxedGatekeeperApp({ frame, gatekeeperVendorId, route = '', visible = true, onRouteChange, onCapabilityLost }: {
  frame: GatekeeperUiFrame,
  gatekeeperVendorId: string,
  /** The app route held in the Workshop URL; changes the app did not report are pushed into it. */
  route?: string,
  /** Whether the app is on screen. A hidden app keeps running but drops any full-viewport overlay. */
  visible?: boolean,
  /** Called with each route the app navigates to, to mirror it into the Workshop URL. */
  onRouteChange?: (route: string, mode: AppRouteMode) => void,
  /**
   * Called when a call relayed to the frame failed because the frame's server-side capability died
   * (do-reset class); the owner re-acquires the frame.
   */
  onCapabilityLost: (frame: GatekeeperUiFrame, error: unknown) => void,
}) {
  const navigate = useNavigate()
  const router = useRouter()
  const { authenticatedApi } = useAuthenticatedApi()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const sessionRef = useRef<{ [Symbol.dispose]?(): void } | null>(null)
  const hostRef = useRef<GatekeeperAppHostImpl | null>(null)
  const connectedRef = useRef(false)
  const invalidatedRef = useRef(false)
  const [overlay, setOverlay] = useState<OverlayState>(null)
  // The open picker owns the receiver dup and settles `selectUsers()` on close or cancellation.
  // State drives rendering; the ref lets callbacks check identity before settling, so late
  // callbacks from a cancelled picker cannot close a newly opened picker.
  const [userPicker, setUserPicker] = useState<UserPicker | null>(null)
  const openPickerRef = useRef<UserPicker | null>(null)
  const nextPickerId = useRef(0)
  const overlayRef = useRef<OverlayState>(null)
  // Push the Workshop's resolved light/dark mode and deployment accent whenever either changes.
  const { resolvedThemeMode } = useTheme()
  const configuredAccentColor = useServerConfig()?.accentColor
  const accentColor = configuredAccentColor && isHexColor(configuredAccentColor)
    ? configuredAccentColor
    : null
  const themeRef = useRef<GatekeeperAppTheme>({ mode: resolvedThemeMode, accentColor })
  themeRef.current = { mode: resolvedThemeMode, accentColor }
  useEffect(() => {
    hostRef.current?.updateTheme({ mode: resolvedThemeMode, accentColor })
  }, [resolvedThemeMode, accentColor])
  // The URL route is read when the app subscribes; later changes reach the open app through
  // pushRoute, which filters out the app's own reports. Coming back on screen re-syncs once.
  const routeRef = useRef(route)
  routeRef.current = route
  const onRouteChangeRef = useRef(onRouteChange)
  onRouteChangeRef.current = onRouteChange
  const onCapabilityLostRef = useRef(onCapabilityLost)
  onCapabilityLostRef.current = onCapabilityLost
  useEffect(() => {
    if (visible) hostRef.current?.pushRoute(route)
    else hostRef.current?.suspendPresentation()
  }, [route, visible])

  const setOverlayPhase = useCallback((next: OverlayState) => {
    if (overlayRef.current === next) return
    overlayRef.current = next
    setOverlay(next)
  }, [])

  // Grow the iframe to full-viewport (or restore it), then report back the pane rect and whether the
  // size actually changed.
  const present = useCallback<PresentController>((active) => {
    const el = iframeRef.current
    const before = el?.getBoundingClientRect()
    // Duplicate restores are common during cleanup; avoid forcing layout when already restored.
    if (!active && overlayRef.current === null) return { rect: null, willResize: false }
    flushSync(() => setOverlayPhase(active ? 'full' : null))
    const after = el?.getBoundingClientRect()
    const willResize =
      !!before && !!after && (before.width !== after.width || before.height !== after.height)
    // On open, `before` is the pane rect the app pins to.
    const rect =
      active && before
        ? { left: before.left, top: before.top, width: before.width, height: before.height }
        : null
    return { rect, willResize }
  }, [setOverlayPhase])
  const openTarget = useCallback<OpenTarget>(({ workspaceId, gadgetId }) => {
    navigate({
      to: '/workspace/$id',
      params: { id: workspaceId },
      search: gadgetId === undefined ? {} : { w: gadgetId },
    })
  }, [navigate])
  const titlesRef = useRef<{ at: number, titles: Promise<Map<string, string>> } | null>(null)
  const resolveWorkspaceTitles = useCallback<ResolveWorkspaceTitles>(async (ids) => {
    let entry = titlesRef.current
    if (!entry || Date.now() - entry.at >= WORKSPACE_TITLES_TTL_MS) {
      entry = {
        at: Date.now(),
        titles: authenticatedApi.listGadgets()
          .then((gadgets) => new Map(gadgets.map((gadget) => [gadget.id, gadget.title]))),
      }
      titlesRef.current = entry
      // Don't cache a failure: drop it so the next lookup retries.
      const failed = entry
      entry.titles.catch(() => {
        if (titlesRef.current === failed) titlesRef.current = null
      })
    }
    const titles = await entry.titles
    return ids.map((id) => titles.get(id) ?? null)
  }, [authenticatedApi])
  const openPrompt = useCallback<OpenPrompt>((prompt) => {
    navigate({ to: '/', search: { prompt } })
  }, [navigate])
  const refreshNavigation = useCallback(() => {
    refreshGatekeeperApps(authenticatedApi)
    revalidateAppNavigation(authenticatedApi, true)
  }, [authenticatedApi])
  const openUserPicker = useCallback<OpenUserPicker>((receiver) => {
    if (openPickerRef.current) {
      throw new Error('A person picker is already open.')
    }
    // Promise.withResolvers is not in this package's ES2023 TypeScript lib.
    let resolve!: () => void
    const promise = new Promise<void>((resolver) => {
      resolve = resolver
    })
    const open: UserPicker = { id: ++nextPickerId.current, receiver, deliveries: new Set(), resolve }
    openPickerRef.current = open
    setUserPicker(open)
    return promise
  }, [])
  // Normal closing waits for deliveries; cancellation releases ownership immediately even if
  // a receiver never settles. Neither path may dispose or settle the same picker twice.
  const finishUserPicker = useCallback((open: UserPicker) => {
    if (openPickerRef.current !== open) return
    openPickerRef.current = null
    setUserPicker(null)
    open.receiver[Symbol.dispose]()
    for (const delivery of open.deliveries) delivery[Symbol.dispose]()
    open.deliveries.clear()
    open.resolve()
  }, [])
  const cancelUserPicker = useCallback<CancelUserPicker>(() => {
    const open = openPickerRef.current
    if (open) finishUserPicker(open)
  }, [finishUserPicker])
  // The live session reads these at call time, so a changed handler (new stub after a reconnect)
  // never tears the session down.
  const handlersRef = useRef({ openTarget, openPrompt, resolveWorkspaceTitles, refreshNavigation, navigate, router });
  handlersRef.current = { openTarget, openPrompt, resolveWorkspaceTitles, refreshNavigation, navigate, router };

  useEffect(() => {
    connectedRef.current = false
    invalidatedRef.current = false

    const connect = (port: MessagePort) => {
      if (connectedRef.current) {
        // A second handshake (e.g. iframe reloaded) invalidates the session.
        invalidatedRef.current = true
        port.close()
        sessionRef.current?.[Symbol.dispose]?.()
        sessionRef.current = null
        hostRef.current?.dispose()
        hostRef.current = null
        dropAppTours(gatekeeperVendorId);
        setOverlayPhase(null)
        return
      }
      if (invalidatedRef.current || !frame.ui) {
        port.close()
        return
      }
      const host = new GatekeeperAppHostImpl(
        frame.ui,
        present,
        themeRef.current,
        (target) => handlersRef.current.openTarget(target),
        (prompt) => handlersRef.current.openPrompt(prompt),
        (ids) => handlersRef.current.resolveWorkspaceTitles(ids),
        openUserPicker,
        cancelUserPicker,
        {
          current: () => routeRef.current,
          report: (next, mode) => onRouteChangeRef.current?.(next, mode),
          openApp: (appId, at, newTab) => {
            const { navigate, router } = handlersRef.current;
            const target = { to: '/gatekeepers/$appId', params: { appId }, search: at ? { at } : {} } as const
            if (newTab) window.open(router.buildLocation(target).href, '_blank', 'noopener')
            else void navigate(target)
          },
          refreshNavigation: () => handlersRef.current.refreshNavigation(),
        },
        (tour, locator, replay) =>
          requestTour({
            key: `app:${gatekeeperVendorId}:${tour.id}`,
            tour,
            route: { kind: "app", appId: gatekeeperVendorId },
            replay,
            locateFrame: (anchor, reveal) => locateInFrame(locator, iframeRef.current, anchor, reveal),
          }),
        gatekeeperVendorId,
      )
      hostRef.current = host
      sessionRef.current = newMessagePortRpcSession(port, host, {
        // Every failure relayed to the frame — `ui`, module stubs it handed out, host methods — is
        // serialized here. A do-reset-class one means the capability behind the frame is gone (its
        // proxying Durable Object was evicted or reset) while the Workshop socket stays healthy, so
        // the reconnect path never fires; the owner must fetch a fresh frame.
        onSendError: (error) => {
          if (classifyRpcError(error) === 'do-reset') onCapabilityLostRef.current(frame, error)
        },
      })
      connectedRef.current = true
    }

    const handleMessage = (event: MessageEvent) => {
      // Only accept the handshake from our own sandboxed iframe (which posts from a null origin).
      // Capture contentWindow first: if the frame isn't mounted there's no legitimate sender, so
      // reject — comparing against a concrete window avoids a `source === undefined` edge.
      const frameWindow = iframeRef.current?.contentWindow
      if (!frameWindow || event.source !== frameWindow || event.origin !== 'null') return
      if (invalidatedRef.current) return
      if (forwardTrustedFrameError(
        event, frameWindow, { surface: 'gatekeeper-app', gatekeeperVendorId },
      )) return
      if (event.data?.type === 'handshake' && event.ports?.[0]) {
        connect(event.ports[0])
      }
    }

    window.addEventListener('message', handleMessage)
    return () => {
      window.removeEventListener('message', handleMessage)
      sessionRef.current?.[Symbol.dispose]?.()
      sessionRef.current = null
      hostRef.current?.dispose()
      hostRef.current = null
      dropAppTours(gatekeeperVendorId);
      setOverlayPhase(null)
    }
    // One session per acquired frame (the iframe is keyed by it, so a new frame always handshakes
    // again); handler changes reach the live session through handlersRef instead of tearing it down.
  }, [frame, gatekeeperVendorId, present, setOverlayPhase, openUserPicker, cancelUserPicker])

  return (
    <>
      <iframe
        key={frameKey(frame)}
        ref={iframeRef}
        // A frame URL is validated by the page (isAppFrameUrl); it loads inside the same sandbox.
        {...(frame.iframeUrl !== undefined ? { src: frame.iframeUrl } : { srcDoc: frame.iframeHtml })}
        // allow-scripts: run the app's JS. allow-modals: its beforeunload unsaved-changes guard.
        // allow-downloads: save files the app already holds (exports, print forms) — browsers block every
        // download from a sandboxed frame without it, even from a user-clicked <a download>. Not
        // allow-same-origin (the frame stays an opaque origin), and the app's CSP keeps connect-src 'none'.
        sandbox="allow-scripts allow-modals allow-downloads"
        allow="clipboard-write"
        title="Gatekeeper app"
        style={iframeStyleForOverlay(overlay)}
      />
      {userPicker && (
        <GatekeeperUserPickerDialog
          key={userPicker.id}
          authenticatedApi={authenticatedApi}
          gatekeeperId={gatekeeperVendorId}
          onSelected={async (selection) => {
            if (openPickerRef.current !== userPicker) {
              return Promise.reject(new Error(USER_PICKER_CANCELLED))
            }
            const delivery = userPicker.receiver.receive(selection)
            userPicker.deliveries.add(delivery)
            try {
              await delivery
            } finally {
              if (userPicker.deliveries.delete(delivery)) delivery[Symbol.dispose]()
            }
          }}
          onClose={() => finishUserPicker(userPicker)}
          onCancel={() => finishUserPicker(userPicker)}
        />
      )}
    </>
  )
}
