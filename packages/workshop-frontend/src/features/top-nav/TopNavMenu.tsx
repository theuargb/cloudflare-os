import type { ReactNode, RefObject } from 'react'
import { Popover } from '@cloudflare/kumo'
import { CaretDownIcon } from '@phosphor-icons/react'

/** Classes of every top bar trigger and link; `triggerClass` adds the state and the icon-only shape. */
const TRIGGER_CLASS =
  'press flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-(length:--app-fs-13) font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-ring data-[popup-open]:bg-kumo-tint'

/** A top bar trigger's classes: active (its screen is on screen) or not, icon-only or labelled. */
export function triggerClass(active: boolean, iconOnly = false): string {
  return [
    TRIGGER_CLASS,
    active ? 'bg-kumo-fill text-kumo-strong' : 'text-kumo-default hover:bg-kumo-tint',
    iconOnly ? 'w-8 justify-center !px-0' : '',
  ].join(' ')
}

/** The inside of a trigger; the hidden measuring row renders the same faces, so widths match. */
export function TriggerFace({ icon, label, caret, trailing }: { icon?: ReactNode; label?: string; caret?: boolean; trailing?: ReactNode }) {
  return (
    <>
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>}
      {label && <span className="truncate">{label}</span>}
      {trailing}
      {caret && <CaretDownIcon size={10} aria-hidden className="shrink-0 text-kumo-inactive" />}
    </>
  )
}

/** Open state of one top bar menu; the bar keeps one menu open at a time. */
export type TopNavMenuState = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The pointer entered the trigger: switches to this menu while another one is open. */
  onHoverSwitch: () => void
}

/** Title style of a menu panel and of a group heading inside «More». */
export const PANEL_TITLE =
  'shrink-0 truncate px-2 pb-1 text-(length:--app-fs-11) leading-(--app-lh-16) font-medium uppercase tracking-[0.06em] text-kumo-inactive'

/**
 * A top bar menu: click opens it under its trigger; with `anchor` (the bar) it is a full-width
 * megamenu under the bar.
 */
export function TopNavMenu({ face, label, active, menu, anchor, wide = false, onPreload, children }: {
  face: ReactNode
  /** Names an icon-only trigger (aria-label and hover title). */
  label?: string
  active: boolean
  menu: TopNavMenuState
  anchor?: RefObject<HTMLElement | null>
  /** A 300px panel instead of 280px when not anchored to the bar. */
  wide?: boolean
  /** Warms the target while the pointer rests on the trigger. */
  onPreload?: { onPointerEnter: () => void; onPointerLeave: () => void; onFocus: () => void }
  children: ReactNode
}) {
  return (
    <Popover open={menu.open} onOpenChange={menu.onOpenChange}>
      <Popover.Trigger
        render={
          <button
            type="button"
            aria-label={label}
            title={label}
            onPointerEnter={() => {
              menu.onHoverSwitch()
              onPreload?.onPointerEnter()
            }}
            onPointerLeave={onPreload?.onPointerLeave}
            onFocus={onPreload?.onFocus}
            className={triggerClass(active, label !== undefined)}
          >
            {face}
          </button>
        }
      />
      <Popover.Content
        side="bottom"
        align="start"
        sideOffset={anchor ? 0 : 6}
        anchor={anchor}
        className={[
          '!z-[1100] !min-w-0 flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-xl bg-kumo-base shadow-lg shadow-kumo-tip-shadow',
          anchor ? '!w-[var(--anchor-width)] !max-w-none rounded-t-none p-3' : wide ? '!w-[300px] p-1' : '!w-[280px] p-1',
        ].join(' ')}
      >
        <div className="sidebar-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
      </Popover.Content>
    </Popover>
  )
}
