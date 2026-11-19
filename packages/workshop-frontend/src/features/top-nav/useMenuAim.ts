import { useCallback, useEffect, useMemo, useRef } from 'react'

type Point = { x: number; y: number; t: number }

/** Pointer moves kept to read the direction: the oldest of them is where the move started. */
const TRAIL = 4
/** The pointer counts as resting (no longer heading for the panel) after this long without a move. */
const REST_MS = 120

/** Whether `p` lies inside the triangle `a`–`b`–`c` (edges included). */
function inTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const side = (u: Point, v: Point, w: Point) => (u.x - w.x) * (v.y - w.y) - (v.x - w.x) * (u.y - w.y)
  const d1 = side(p, a, b)
  const d2 = side(p, b, c)
  const d3 = side(p, c, a)
  const negative = d1 < 0 || d2 < 0 || d3 < 0
  const positive = d1 > 0 || d2 > 0 || d3 > 0
  return !(negative && positive)
}

/** What a hover over another trigger does: `hover` switches now or once the pointer rests, `cancel` drops a pending switch. */
export type MenuAim = { hover: (switchTo: () => void) => void; cancel: () => void }

/**
 * The «safe triangle» of a menu bar (menu aim): while a menu is open, a hover over another trigger
 * switches to it at once, unless the pointer is heading for the open panel (its last move lies inside
 * the triangle from where the move started to the panel's top corners). Then the switch waits until
 * the pointer rests on that trigger, and is dropped when it leaves it, so a diagonal move from a
 * trigger down into its panel never flips the panel on the way.
 */
export function useMenuAim(open: boolean, panel: () => Element | null): MenuAim {
  const trail = useRef<Point[]>([])
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!open) return
    const onMove = (event: PointerEvent) => {
      trail.current.push({ x: event.clientX, y: event.clientY, t: event.timeStamp })
      if (trail.current.length > TRAIL) trail.current.shift()
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      document.removeEventListener('pointermove', onMove)
      window.clearTimeout(timer.current)
      trail.current = []
    }
  }, [open])

  const aiming = useCallback(() => {
    const points = trail.current
    const rect = panel()?.getBoundingClientRect()
    if (!rect || points.length < 2) return false
    const from = points[0]!
    const to = points.at(-1)!
    if (performance.now() - to.t > REST_MS || to.y >= rect.top) return false
    return inTriangle(to, from, { x: rect.left, y: rect.top, t: 0 }, { x: rect.right, y: rect.top, t: 0 })
  }, [panel])

  return useMemo(() => {
    const cancel = () => window.clearTimeout(timer.current)
    const hover = (switchTo: () => void) => {
      cancel()
      const attempt = () => {
        if (aiming()) timer.current = window.setTimeout(attempt, REST_MS)
        else switchTo()
      }
      attempt()
    }
    return { hover, cancel }
  }, [aiming])
}
