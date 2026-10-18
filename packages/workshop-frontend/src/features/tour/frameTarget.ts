import type { RpcStub } from 'capnweb'
import type { GatekeeperAppTourLocator } from '@gadgets/workshop-shared/app-host'
import { isTourRect, type TourRect } from '@gadgets/workshop-shared/tour'
import { intersectRects } from './tourGeometry'

/** A frame that does not answer in time is treated as not having the anchor. */
const LOCATE_TIMEOUT_MS = 1500

/**
 * Where a frame's `data-tour` anchor is in host viewport px, clipped to the iframe; null when the
 * frame lacks it, answers late or garbage, or the iframe is gone.
 */
export const locateInFrame = async (
  locator: RpcStub<GatekeeperAppTourLocator>,
  iframe: HTMLIFrameElement | null,
  anchor: string,
  reveal: boolean,
): Promise<TourRect | null> => {
  let timer = 0
  const timeout = new Promise<null>((resolve) => {
    timer = window.setTimeout(() => resolve(null), LOCATE_TIMEOUT_MS)
  })
  const located: unknown = await Promise.race([
    Promise.resolve(locator.locate(anchor, reveal)).catch(() => null),
    timeout,
  ])
  window.clearTimeout(timer)
  if (!iframe || !isTourRect(located)) return null
  const frame = iframe.getBoundingClientRect()
  const box = { left: frame.left, top: frame.top, width: frame.width, height: frame.height }
  return intersectRects({ ...located, left: box.left + located.left, top: box.top + located.top }, box)
}
