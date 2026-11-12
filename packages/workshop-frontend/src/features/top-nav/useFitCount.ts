import { useLayoutEffect, useState, type RefObject } from 'react'

/**
 * How many leading items fit in `track`; the rest go to «More». `measure` is an invisible row holding
 * one face per item, then the More face, so widths are known for items that are not shown.
 * Re-measures when the track or the faces resize (window width, app text size) and when `signature`
 * (the items and their labels) changes.
 */
export function useFitCount(
  track: RefObject<HTMLElement | null>,
  measure: RefObject<HTMLElement | null>,
  signature: string,
): number {
  const [fit, setFit] = useState(Number.MAX_SAFE_INTEGER)

  useLayoutEffect(() => {
    const trackElement = track.current
    const measureElement = measure.current
    if (!trackElement || !measureElement) return
    const compute = () => {
      const widths = [...measureElement.children].map((child) => (child as HTMLElement).offsetWidth)
      const moreWidth = widths.pop() ?? 0
      const gap = parseFloat(getComputedStyle(trackElement).columnGap) || 0
      const available = trackElement.clientWidth
      const total = widths.reduce((sum, width, index) => sum + width + (index > 0 ? gap : 0), 0)
      if (total <= available) {
        setFit(widths.length)
        return
      }
      let used = moreWidth
      let count = 0
      for (const width of widths) {
        if (used + gap + width > available) break
        used += gap + width
        count++
      }
      setFit(count)
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(trackElement)
    observer.observe(measureElement)
    return () => observer.disconnect()
  }, [track, measure, signature])

  return fit
}
