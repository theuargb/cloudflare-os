import { Link, useRouterState, type LinkProps } from '@tanstack/react-router'
import { appRouteEntry } from '@gadgets/workshop-shared/app-host'
import type { ReactNode } from 'react'

/**
 * A single nav row in the sidebar. Renders as a TanStack <Link>. Active state is computed from the
 * current router pathname so we can also tint the icon (TanStack's activeProps only swaps top-level
 * className, not child styles). When `collapsed` is true the label is hidden but kept in the DOM for
 * screen readers / hover-tooltips.
 */
export type SidebarItemProps = {
  icon: ReactNode
  label: string
  to: LinkProps['to']
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
  params,
  search,
  entry,
  trailing,
  collapsed = false,
  matchPrefix = false,
  endAction,
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

  // Kept loose: the generated route-tree union is stricter than is convenient for a generic row.
  const linkProps = { to, params, search } as unknown as LinkProps

  const link = (
    <Link
      {...linkProps}
      title={collapsed ? label : undefined}
      className={[
        'group relative flex h-11 items-center gap-2.5 rounded-lg px-2.5 text-[14px] leading-5 transition-colors md:h-8 md:text-[13px] md:leading-[18px]',
        isActive
          ? 'bg-kumo-fill font-medium text-kumo-strong'
          : 'font-normal text-kumo-default hover:bg-kumo-tint',
        endAction ? 'pr-9' : '',
      ].join(' ')}
    >
      <span
        className={[
          'flex h-5 w-5 shrink-0 items-center justify-center transition-colors',
          isActive ? 'text-kumo-brand' : 'text-kumo-subtle group-hover:text-kumo-default',
        ].join(' ')}
      >
        {icon}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {trailing && <span className="shrink-0 text-kumo-inactive">{trailing}</span>}
        </>
      )}
    </Link>
  )
  if (!endAction) return link
  return (
    <div className="group/item relative">
      {link}
      <div className="absolute inset-y-0 right-1.5 flex items-center">{endAction}</div>
    </div>
  )
}
