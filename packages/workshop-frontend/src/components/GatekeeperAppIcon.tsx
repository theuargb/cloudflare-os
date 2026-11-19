import { BookOpenIcon } from '@phosphor-icons/react'
import type { GatekeeperAppInfo } from '@gadgets/workshop-shared/api'

/** A gatekeeper management app's (monochrome) icon, as a CSS mask tinted like Phosphor icons. Also renders a composed module's icon. */
export function GatekeeperAppIcon({ app }: { app: Pick<GatekeeperAppInfo, 'icon'> }) {
  if (!app.icon) return <BookOpenIcon size={14} weight="regular" />
  // Escape the icon URL for safe interpolation into a CSS url("…") string.
  const maskUrl = `url("${app.icon.url.replace(/[\\"]/g, '\\$&')}")`
  return (
    // 15px: app outlines keep a ~3-unit inset in their 24-unit box, so this matches a 14px Phosphor glyph optically.
    <span
      aria-hidden
      className="h-[15px] w-[15px] shrink-0 bg-current"
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
