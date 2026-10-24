import { useSyncExternalStore } from 'react'

const DESKTOP_QUERY = '(width >= 48rem)'

/** Whether the desktop chrome (fixed rail) is shown: the Tailwind `md` breakpoint. */
export function useDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DESKTOP_QUERY)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  )
}
