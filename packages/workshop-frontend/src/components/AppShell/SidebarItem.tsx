import { Link, useRouterState, type LinkProps } from '@tanstack/react-router'
import { ArrowSquareOut, CaretDown } from '@phosphor-icons/react'
import { appRouteEntry } from '@gadgets/workshop-shared/app-host'
import type { ReactElement, ReactNode } from 'react'
import { preloadIntent } from '../../features/app-preload/appPreload'

/**
 * A single nav row in the sidebar: a TanStack <Link>, an external anchor, or — for a row with pages
 * (`pages`) — a toggle that lists them under it instead of opening the app's landing screen. Active
 * state is computed from the current router pathname so we can also tint the icon (TanStack's
 * activeProps only swaps top-level className, not child styles). When `collapsed` is true the label
 * is hidden but kept in the DOM for screen readers / hover-tooltips.
 */
export type SidebarItemProps = {
  icon: ReactNode
  label: string
  /** In-app route; absent on an external row (`href`). */
  to?: LinkProps['to'];
  /** External page: the row is a plain anchor that opens in a new tab and is never active. */
  href?: string;
  params?: LinkProps['params']
  /** Search params of the link (an app entry row passes the entry's route as `at`). */
  search?: { at: string }
  /** Row of an app entry: active only while the open app screen belongs to this entry (no entry in the route = the first one). */
  entry?: { id: string; first: boolean }
  trailing?: ReactNode
  collapsed?: boolean
  /** When true, match this item active when the current path starts with `to`. */
  matchPrefix?: boolean
  /** Hover-revealed control rendered beside, not inside, the link (a button in an anchor is invalid). */
  endAction?: ReactNode
  /** Rendered under the row while it is open (`active`: the row's app screen is on screen). */
  nested?: (active: boolean) => ReactNode
  /** Wraps the row (the collapsed rail's page flyout): on a row with pages always, else while active. */
  flyout?: (row: ReactElement<{ title?: string }>, active: boolean) => ReactNode
  /** Warms the row's target while the pointer rests on it or it has focus (a row that opens an app route). */
  preload?: () => void
  /**
   * The row lists pages instead of opening `to`: it is a toggle that shows `nested` under it. `open`
   * overrides the default (open while active); `onToggle` gets the requested state and the row.
   * `draggable`: the toggle is a drag source (a link is one natively, a button is not).
   */
  pages?: { open?: boolean; onToggle?: (open: boolean, row: HTMLElement) => void; draggable?: boolean }
}

/** The app entry named by an open `/gatekeepers/<app>?at=<route>` location (null when the route names none). */
function openAppEntry(search: unknown): string | null {
  if (typeof search !== 'object' || search === null || !('at' in search) || typeof search.at !== 'string') return null
  return appRouteEntry(search.at)
}

export default function SidebarItem({
  icon,
  label,
  to,
  href,
  params,
  search,
  entry,
  trailing,
  collapsed = false,
  matchPrefix = false,
  endAction,
  nested,
  flyout,
  preload,
  pages,
}: SidebarItemProps) {
  // Resolve the active path manually so we can style the icon as well as the row. For parameterized
  // routes (e.g. "/gatekeepers/$appId"), substitute the params so the resolved path can match.
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const openEntry = useRouterState({ select: (s) => openAppEntry(s.location.search) })
  let target = typeof to === 'string' ? to : ''
  if (params) {
    for (const [key, value] of Object.entries(params as Record<string, string>)) {
      target = target.replaceAll(`$${key}`, String(value))
    }
  }
  const onPath = matchPrefix
    ? pathname === target || pathname.startsWith(target + '/')
    : pathname === target
  const isActive = onPath && (!entry || openEntry === entry.id || (openEntry === null && entry.first))
  // A row with pages opens them in place (the active row by default); any other row nests under itself while active.
  const open = pages ? (pages.open ?? isActive) : isActive

  // Kept loose: the generated route-tree union is stricter than is convenient for a generic row.
  const linkProps = { to, params, search } as unknown as LinkProps

  // Collapsed: a centered 36px tile like the rail's search button, so the hover/active box sits on the icon.
  const rowClass = [
    'group relative flex items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-ring focus-visible:ring-offset-2 focus-visible:ring-offset-kumo-elevated',
    collapsed
      ? 'mx-auto h-9 w-9 justify-center'
      : 'h-11 gap-2.5 px-2.5 text-[14px] leading-5 md:h-7 md:text-[13px] md:leading-[18px]',
    isActive
      ? 'bg-kumo-fill font-medium text-kumo-strong'
      : 'font-normal text-kumo-default hover:bg-kumo-tint',
    endAction ? 'pr-9' : '',
  ].join(' ')
  const iconClass = [
    'flex h-5 w-5 shrink-0 items-center justify-center transition-colors',
    isActive ? 'text-kumo-brand' : 'text-kumo-subtle group-hover:text-kumo-default',
  ].join(' ')
  const content = (
    <>
      <span className={iconClass}>{icon}</span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {href && <ArrowSquareOut size={12} aria-hidden className="shrink-0 text-kumo-inactive" />}
          {trailing && <span className="shrink-0 text-kumo-inactive">{trailing}</span>}
          {pages && (
            <CaretDown
              size={10}
              aria-hidden
              className={`shrink-0 text-kumo-inactive transition-transform ${open ? '' : '-rotate-90'}`}
            />
          )}
        </>
      )}
    </>
  );
  const link = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={collapsed ? label : "Opens in a new tab"}
      className={rowClass}
    >
      {content}
    </a>
  ) : pages ? (
    <button
      type="button"
      aria-expanded={collapsed ? undefined : open}
      {...(preload ? preloadIntent(preload) : {})}
      draggable={pages.draggable}
      title={collapsed ? label : undefined}
      onClick={(event) => pages.onToggle?.(!open, event.currentTarget)}
      className={`${rowClass} cursor-pointer text-left ${collapsed ? '' : 'w-full'}`}
    >
      {content}
    </button>
  ) : (
    <Link {...linkProps} {...(preload ? preloadIntent(preload) : {})} title={collapsed ? label : undefined} className={rowClass}>
      {content}
    </Link>
  )
  const shown = flyout && (pages || isActive) ? flyout(link, isActive) : link
  const row = endAction ? (
    <div className="group/item relative">
      {shown}
      <div className="absolute inset-y-0 right-1.5 flex items-center">{endAction}</div>
    </div>
  ) : shown
  if (!open || !nested) return row
  return (
    <>
      {row}
      {nested(isActive)}
    </>
  )
}
