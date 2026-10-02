import { BookOpenIcon } from '@phosphor-icons/react'
import type { GatekeeperAppInfo } from '@gadgets/workshop-shared/api'

/** A gatekeeper management app's (monochrome) icon, as a CSS mask tinted like Phosphor icons. */
export function GatekeeperAppIcon({ app }: { app: GatekeeperAppInfo }) {
  if (!app.icon) return <BookOpenIcon size={14} weight="regular" />
  // Escape the icon URL for safe interpolation into a CSS url("…") string.
  const maskUrl = `url("${app.icon.url.replace(/[\\"]/g, '\\$&')}")`
  return (
    <span
      aria-hidden
      className="h-3.5 w-3.5 bg-current"
      style={{
        maskImage: maskUrl,
        WebkitMaskImage: maskUrl,
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
      }}
    />
  )
}
