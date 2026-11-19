import { useRef, type ReactNode, type RefObject } from 'react'
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

/** A top bar menu's trigger id (the shared popover's `triggerId`): the key, encoded since group keys hold spaces. */
const TRIGGER_ID_PREFIX = 'top-nav-menu-'
const triggerIdOf = (key: string) => `${TRIGGER_ID_PREFIX}${encodeURIComponent(key)}`
const menuKeyOf = (element: Element | undefined) =>
  element?.id.startsWith(TRIGGER_ID_PREFIX) ? decodeURIComponent(element.id.slice(TRIGGER_ID_PREFIX.length)) : null

/** What a trigger reports to the bar: the pointer entered it (`key` null: a plain link) or left it. */
export type TopNavMenuControl = { hover: (key: string | null) => void; leave: () => void }

/** Title style of a group heading inside «More». */
export const PANEL_TITLE =
  'shrink-0 truncate px-2 pb-1 text-(length:--app-fs-11) leading-(--app-lh-16) font-medium uppercase tracking-[0.06em] text-kumo-inactive'

/** Marks the open panel, so the menu aim can measure it. */
export const PANEL_ATTRIBUTE = 'data-top-nav-panel'

/**
 * The open panel: a full-width megamenu under the bar (`mega`), or a 280px (`menu`) / 300px (`wide`)
 * dropdown under its trigger. `title` names a panel whose trigger shows only an icon or whose
 * heading the trigger already shows (screen readers only).
 */
export type TopNavPanel = { shape: 'mega' | 'menu' | 'wide'; title?: string; content: ReactNode }

/**
 * Every top bar menu is one popover with many triggers, so moving between triggers swaps the panel
 * in place instead of closing one popup and opening another (no flash). Click opens and closes;
 * hovering triggers while open switches (the bar guards it with the menu aim).
 */
export function TopNavMenus({ openKey, onOpenKeyChange, panel, anchor, children }: {
  openKey: string | null
  onOpenKeyChange: (key: string | null) => void
  /** The open key's panel; null closes the popover. */
  panel: TopNavPanel | null
  /** The bar, under which a megamenu spans. */
  anchor: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  // The last panel stays rendered while the popup fades out after a close.
  const lastPanel = useRef<TopNavPanel | null>(null)
  if (panel) lastPanel.current = panel
  const shown = panel ?? lastPanel.current
  const mega = shown?.shape === 'mega'
  return (
    <Popover
      open={panel !== null}
      triggerId={panel && openKey !== null ? triggerIdOf(openKey) : null}
      onOpenChange={(open, details) => onOpenKeyChange(open ? menuKeyOf(details.trigger) : null)}
    >
      {children}
      <Popover.Content
        side="bottom"
        align="start"
        sideOffset={mega ? 0 : 6}
        anchor={mega ? anchor : undefined}
        className={[
          '!z-[1100] !min-w-0 flex max-h-[min(70vh,560px)] flex-col overflow-hidden rounded-xl bg-kumo-base shadow-lg shadow-kumo-tip-shadow',
          mega ? '!w-[var(--anchor-width)] !max-w-none rounded-t-none p-3' : shown?.shape === 'wide' ? '!w-[300px] p-1' : '!w-[280px] p-1',
        ].join(' ')}
      >
        {shown?.title && <Popover.Title className="sr-only">{shown.title}</Popover.Title>}
        <div {...{ [PANEL_ATTRIBUTE]: '' }} className="sidebar-scroll min-h-0 flex-1 overflow-y-auto">
          {shown?.content}
        </div>
      </Popover.Content>
    </Popover>
  )
}

/** A trigger of the shared top bar popover (inside `TopNavMenus`). */
export function TopNavTrigger({ menuKey, face, label, active, control, onPreload }: {
  menuKey: string
  face: ReactNode
  /** Names an icon-only trigger (aria-label and hover title). */
  label?: string
  active: boolean
  control: TopNavMenuControl
  /** Warms the target while the pointer rests on the trigger. */
  onPreload?: { onPointerEnter: () => void; onPointerLeave: () => void; onFocus: () => void }
}) {
  return (
    <Popover.Trigger
      id={triggerIdOf(menuKey)}
      render={
        <button
          type="button"
          aria-label={label}
          title={label}
          onPointerEnter={() => {
            control.hover(menuKey)
            onPreload?.onPointerEnter()
          }}
          onPointerLeave={() => {
            control.leave()
            onPreload?.onPointerLeave()
          }}
          onFocus={onPreload?.onFocus}
          className={triggerClass(active, label !== undefined)}
        >
          {face}
        </button>
      }
    />
  )
}
