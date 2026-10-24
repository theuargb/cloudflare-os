import { useCallback, useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useOptionalAuthenticatedApi } from '../../AuthContext'
import { homeTourRequest } from './homeTour'
import { markTourCompleted, readCompletedTours } from './tourProgress'
import { activateTour, discardTour, finishTour, requestTour, routeMatches, useTourState } from './tourStore'
import TourOverlay from './TourOverlay'

/** Lets async content (sidebar navigation, the app frame's first screen) settle before a tour measures it. */
const AUTO_START_DELAY_MS = 800
/** A replay follows a click: lets the menu close and a route the replay navigated to render. */
const REPLAY_DELAY_MS = 300

/**
 * Runs the queued tours one at a time, each only on its own route and only while the user has not
 * finished its current version (replays excepted). Mounted once in the app shell.
 */
export default function TourHost() {
  const { pending, active } = useTourState()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const userId = useOptionalAuthenticatedApi()?.currentUser?.id ?? null

  useEffect(() => {
    requestTour(homeTourRequest(false))
  }, [])

  const candidate = pending.find((request) => routeMatches(request.route, pathname)) ?? null
  useEffect(() => {
    if (active || !userId || !candidate) return
    if (!candidate.replay && (readCompletedTours(userId)[candidate.key] ?? 0) >= candidate.tour.version) {
      discardTour(candidate.key)
      return
    }
    const delay = candidate.replay ? REPLAY_DELAY_MS : AUTO_START_DELAY_MS
    const timer = window.setTimeout(() => activateTour(candidate.key), delay)
    return () => window.clearTimeout(timer)
  }, [active, userId, candidate])

  // Leaving the tour's route stops it without marking it done: it shows again next time.
  useEffect(() => {
    if (active && !routeMatches(active.route, pathname)) finishTour()
  }, [active, pathname])

  const finish = useCallback(
    (completed: boolean) => {
      if (completed && userId && active) markTourCompleted(userId, active.key, active.tour.version)
      finishTour()
    },
    [active, userId],
  )

  return active ? <TourOverlay key={active.key} request={active} onFinish={finish} /> : null
}

export const useTourActive = (): boolean => useTourState().active !== null
