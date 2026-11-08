import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { TourRect, TourStep } from '@gadgets/workshop-shared/tour'
import TourCard from './TourCard'
import { findHostTarget, padRect, placeCard, sameRect, visibleRect } from './tourGeometry'
import type { TourRequest } from './tourStore'

/** Room around the target inside the highlight. */
const HIGHLIGHT_PADDING = 6
const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/** Where a step points: `center` for a step without a target, null when its target is not on screen. */
type Resolved = TourRect | 'center' | null

/** The step on screen: its index among the available steps, and its target rect (null = centered). */
type Shown = { position: number; rect: TourRect | null }

type Size = { width: number; height: number }

type TourOverlayProps = {
  request: TourRequest
  /** `completed`: the user went through or dismissed the tour, so it should not start by itself again. */
  onFinish: (completed: boolean) => void
}

/**
 * Runs one tour: probes which steps are on screen, walks them with the keyboard or the card's
 * buttons, keeps the highlight on its target while the layout moves, and blocks the page beneath.
 */
export default function TourOverlay({ request, onFinish }: TourOverlayProps) {
  const { steps } = request.tour
  const [available, setAvailable] = useState<readonly number[]>([])
  const [shown, setShown] = useState<Shown | null>(null)
  const [cardSize, setCardSize] = useState<Size | null>(null)
  const [viewport, setViewport] = useState<Size>({ width: window.innerWidth, height: window.innerHeight })
  const seqRef = useRef(0)
  // The probe and the walk run once per tour; a new `onFinish` identity must not restart them.
  const onFinishRef = useRef(onFinish)
  onFinishRef.current = onFinish
  const cardRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  const bodyId = useId()

  const resolve = useCallback(
    async (step: TourStep, reveal: boolean): Promise<Resolved> => {
      const target = step.target
      if (!target) return 'center'
      if ('frame' in target) return (await request.locateFrame?.(target.frame, reveal)) ?? null
      const element = findHostTarget(target)
      if (!element) return null
      if (reveal) element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      return visibleRect(element)
    },
    [request],
  )

  /**
   * Shows the step at `position` of `list`, or the nearest one in `direction` whose target is on
   * screen; steps found missing leave the list. Walking past the end finishes the tour.
   */
  const enter = useCallback(
    async (position: number, direction: 1 | -1, list: readonly number[]) => {
      const seq = ++seqRef.current
      let items = list
      let at = position
      let towards = direction
      while (at < items.length) {
        if (at < 0) {
          at = 0
          towards = 1
          continue
        }
        const resolved = await resolve(steps[items[at]], true)
        if (seq !== seqRef.current) return
        if (resolved !== null) {
          setAvailable(items)
          setShown({ position: at, rect: resolved === 'center' ? null : resolved })
          return
        }
        items = items.filter((_, index) => index !== at)
        if (towards < 0) at -= 1
      }
      onFinishRef.current(true)
    },
    [resolve, steps],
  )

  // Probe every step once: a tour whose targets are all missing (another layout, a screen without
  // the app's chrome) ends quietly instead of showing only its centered cards.
  useEffect(() => {
    let cancelled = false
    void Promise.all(steps.map((step) => resolve(step, false))).then((results) => {
      if (cancelled) return
      const items = steps.flatMap((_, index) => (results[index] === null ? [] : [index]))
      if (!items.some((index) => steps[index].target)) onFinishRef.current(false)
      else void enter(0, 1, items)
    })
    return () => {
      cancelled = true
      seqRef.current += 1
    }
  }, [enter, resolve, steps])

  const current = shown ? steps[available[shown.position]] : null
  const next = useCallback(() => {
    if (shown) void enter(shown.position + 1, 1, available)
  }, [available, enter, shown])
  const back = useCallback(() => {
    if (shown && shown.position > 0) void enter(shown.position - 1, -1, available)
  }, [available, enter, shown])
  const close = useCallback(() => onFinishRef.current(true), [])

  // Follow the target while the layout moves. Host targets: their own size, window resize and any
  // scroll; frame targets: window resize (the frame reports nothing else). No polling.
  useEffect(() => {
    const target = current?.target
    if (!shown || !target) return
    let frame = 0
    const update = (rect: TourRect | null) =>
      setShown((prev) => (prev && prev.position === shown.position && !sameRect(prev.rect, rect) ? { ...prev, rect } : prev))
    if ('frame' in target) {
      const remeasure = () => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          void request.locateFrame?.(target.frame, false).then((rect) => {
            if (rect) update(rect)
          })
        })
      }
      window.addEventListener('resize', remeasure)
      return () => {
        cancelAnimationFrame(frame)
        window.removeEventListener('resize', remeasure)
      }
    }
    let observed = findHostTarget(target)
    const remeasure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const element = findHostTarget(target)
        const rect = element && visibleRect(element)
        if (!element || !rect) {
          void enter(shown.position, 1, available.filter((_, index) => index !== shown.position))
          return
        }
        if (element !== observed) {
          if (observed) observer.unobserve(observed)
          observer.observe(element)
          observed = element
        }
        update(rect)
      })
    }
    const observer = new ResizeObserver(remeasure)
    if (observed) observer.observe(observed)
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, { capture: true, passive: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, { capture: true })
    }
  }, [available, current, enter, request, shown?.position])

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // The card's own size decides where it fits; it changes with the step's text.
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const observer = new ResizeObserver(() => {
      const { offsetWidth: width, offsetHeight: height } = card
      setCardSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }))
    })
    observer.observe(card)
    return () => observer.disconnect()
  }, [shown !== null])

  // Keyboard owns the page while the tour runs: capture phase, so ⌘K, `/` and app shortcuts never
  // see the keys the tour uses or blocks.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const card = cardRef.current
      const isButton = event.target instanceof HTMLButtonElement
      const isPalette = (event.key === 'k' || event.key === 'K') && (event.metaKey || event.ctrlKey)
      if (event.key === 'Escape') close()
      else if (event.key === 'ArrowRight' || (event.key === 'Enter' && !isButton)) next()
      else if (event.key === 'ArrowLeft') back()
      else if (event.key === 'Tab' && card) {
        const focusable = [...card.querySelectorAll<HTMLElement>(FOCUSABLE)]
        const index = focusable.indexOf(document.activeElement as HTMLElement)
        const step = event.shiftKey ? -1 : 1
        focusable[(index + step + focusable.length) % focusable.length]?.focus()
      } else if (event.key !== '/' && !isPalette) return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [back, close, next])

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => previous?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!shown) return
    const frame = requestAnimationFrame(() => primaryRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [shown?.position, available])

  if (!shown || !current) return null

  const highlight = shown.rect && padRect(shown.rect, HIGHLIGHT_PADDING)
  const cutout = highlight ?? { left: viewport.width / 2, top: viewport.height / 2, width: 0, height: 0 }
  const placement = cardSize && placeCard(highlight, cardSize, viewport, current.side ?? 'bottom')

  return createPortal(
    <div className="fixed inset-0 z-[1300]" onPointerDown={(event) => event.preventDefault()}>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute rounded-xl shadow-[0_0_0_200vmax_color-mix(in_oklab,var(--color-kumo-recessed)_80%,transparent)] transition-[top,left,width,height] duration-300 ease-out motion-reduce:transition-none ${
          highlight ? 'ring-2 ring-kumo-brand' : ''
        }`}
        style={cutout}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="absolute w-[min(360px,calc(100vw-24px))] rounded-xl border border-kumo-line bg-kumo-base p-4 themed-floating-shadow-lg transition-[top,left] duration-300 ease-out motion-reduce:transition-none"
        style={placement ?? { left: 0, top: 0, visibility: 'hidden' }}
      >
        <TourCard
          step={current}
          position={shown.position + 1}
          total={available.length}
          onNext={next}
          onBack={back}
          onClose={close}
          primaryRef={primaryRef}
          titleId={titleId}
          bodyId={bodyId}
        />
      </div>
    </div>,
    document.body,
  )
}
