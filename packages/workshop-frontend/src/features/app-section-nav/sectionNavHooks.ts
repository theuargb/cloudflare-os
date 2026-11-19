import { useSyncExternalStore } from 'react'
import { useRouterState } from '@tanstack/react-router'

const DESKTOP_QUERY = '(width >= 48rem)'

/** The gatekeeper app on screen (`/gatekeepers/<appId>`), else null. */
export function useOpenAppId(): string | null {
  const segment = useRouterState({ select: (s) => /^\/gatekeepers\/([^/]+)\/?$/.exec(s.location.pathname)?.[1] ?? null })
  return segment === null ? null : decodeURIComponent(segment)
}

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
