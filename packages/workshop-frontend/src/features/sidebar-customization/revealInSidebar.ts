/** Space kept between revealed content and the scroll region's edges. */
const MARGIN = 8

/**
 * Scrolls the sidebar's scroll region so `content` (a group's rows, an app's sections) is fully
 * visible, without pushing `anchor` (the row or header that opened it) above the top.
 */
export function revealBelow(anchor: HTMLElement, content: HTMLElement): void {
  const scroller = content.closest<HTMLElement>('.sidebar-scroll')
  if (!scroller) return
  const view = scroller.getBoundingClientRect()
  const overflow = content.getBoundingClientRect().bottom + MARGIN - view.bottom
  if (overflow <= 0) return
  const room = anchor.getBoundingClientRect().top - MARGIN - view.top
  const delta = Math.min(overflow, room)
  if (delta <= 0) return
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  scroller.scrollBy({ top: delta, behavior: reduced ? 'auto' : 'smooth' })
}
