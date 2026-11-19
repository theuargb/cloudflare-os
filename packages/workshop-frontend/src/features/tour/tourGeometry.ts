import type { HostTourAnchor, TourRect, TourSide } from '@gadgets/workshop-shared/tour'

type Size = { width: number; height: number }

/** Space between the highlighted target and the card. */
const GAP = 14
/** Closest the card comes to the viewport edge. */
const MARGIN = 12

const OPPOSITE: Record<TourSide, TourSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }
const SIDES: readonly TourSide[] = ['right', 'bottom', 'left', 'top']
const CLIPPING_OVERFLOW = /auto|scroll|hidden|clip/

/**
 * The first rendered element of a host anchor (or of a sidebar group by its default title). Hidden
 * copies (the desktop rail below `md`, the brand-row button while collapsed) and anything inside an
 * inert subtree are skipped.
 */
export const findHostTarget = (target: { host: HostTourAnchor } | { hostGroup: string }): HTMLElement | null => {
  const selector = 'host' in target
    ? `[data-tour="${target.host}"]`
    : `[data-tour="sidebar-group"][data-tour-group="${CSS.escape(target.hostGroup)}"]`
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    if (element.getClientRects().length > 0 && !element.closest('[inert]')) return element
  }
  return null
}

export const intersectRects = (a: TourRect, b: TourRect): TourRect | null => {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const right = Math.min(a.left + a.width, b.left + b.width)
  const bottom = Math.min(a.top + a.height, b.top + b.height)
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null
}

/** The part of `element` the user can see: clipped by scrolling ancestors and the viewport. */
export const visibleRect = (element: Element): TourRect | null => {
  const { left, top, width, height } = element.getBoundingClientRect()
  let rect: TourRect | null = { left, top, width, height }
  for (let parent = element.parentElement; parent && rect; parent = parent.parentElement) {
    const style = getComputedStyle(parent)
    if (CLIPPING_OVERFLOW.test(style.overflowX) || CLIPPING_OVERFLOW.test(style.overflowY)) {
      const box = parent.getBoundingClientRect()
      rect = intersectRects(rect, { left: box.left, top: box.top, width: box.width, height: box.height })
    }
  }
  return rect && intersectRects(rect, { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight })
}

/** Equal within half a pixel: re-measuring a still target must not re-render the overlay. */
export const sameRect = (a: TourRect | null, b: TourRect | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5)

export const padRect = (rect: TourRect, by: number): TourRect => ({
  left: rect.left - by,
  top: rect.top - by,
  width: rect.width + by * 2,
  height: rect.height + by * 2,
})

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

/**
 * Where the card goes: on the preferred side of the target, else the opposite one, else any side
 * with room; centered when there is no target or no side fits (a target filling the screen).
 */
export const placeCard = (target: TourRect | null, card: Size, viewport: Size, side: TourSide): { left: number; top: number } => {
  const centered = { left: (viewport.width - card.width) / 2, top: (viewport.height - card.height) / 2 }
  let position = centered
  if (target) {
    const room: Record<TourSide, number> = {
      right: viewport.width - (target.left + target.width) - card.width,
      left: target.left - card.width,
      bottom: viewport.height - (target.top + target.height) - card.height,
      top: target.top - card.height,
    }
    const order = [side, OPPOSITE[side], ...SIDES.filter((item) => item !== side && item !== OPPOSITE[side])]
    const fitting = order.find((item) => room[item] >= GAP + MARGIN)
    const middleY = target.top + target.height / 2 - card.height / 2
    const middleX = target.left + target.width / 2 - card.width / 2
    if (fitting === 'right') position = { left: target.left + target.width + GAP, top: middleY }
    else if (fitting === 'left') position = { left: target.left - GAP - card.width, top: middleY }
    else if (fitting === 'bottom') position = { left: middleX, top: target.top + target.height + GAP }
    else if (fitting === 'top') position = { left: middleX, top: target.top - GAP - card.height }
  }
  return {
    left: clamp(position.left, MARGIN, viewport.width - card.width - MARGIN),
    top: clamp(position.top, MARGIN, viewport.height - card.height - MARGIN),
  }
}
