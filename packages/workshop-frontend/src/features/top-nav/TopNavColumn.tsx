import { Link, type LinkProps } from '@tanstack/react-router'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { isNavRowActive, type NavLocation } from '../../components/AppShell/navRowActive'
import { preloadAppRoute, preloadIntent } from '../app-preload/appPreload'
import { isFavoritePage, toggleFavoritePage, useFavoritePages } from '../app-section-nav/favoritePages'
import { PageRow } from '../app-section-nav/PageRow'
import { useRowPages } from '../app-section-nav/sectionPages'
import type { SidebarItemDef } from '../sidebar-customization/sidebarNavDefs'
import type { TopNavRow } from './topNavItems'
import { TopNavMenu, TriggerFace, triggerClass, type TopNavMenuState } from './TopNavMenu'

// Kept loose: the generated route-tree union is stricter than is convenient for a generic row (as in SidebarItem).
const linkProps = (def: SidebarItemDef) => ({ to: def.to, params: def.params, search: def.search }) as unknown as LinkProps

const preloadOf = (def: SidebarItemDef) =>
  def.appId ? preloadIntent(() => preloadAppRoute(def.appId!, def.search?.at ?? '')) : undefined

/** Megamenu columns: one per row (module), each with its pages. */
export function TopNavColumns({ rows, location, onNavigate }: {
  rows: TopNavRow[]
  location: NavLocation
  /** Runs after a pick (closes the menu). */
  onNavigate: () => void
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-4 gap-y-3">
      {rows.map((row) => (
        <TopNavColumn key={row.def.key} row={row} location={location} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

/**
 * One module in a megamenu: its header (a link, or a plain title when the row lists pages: a row with
 * pages never opens the module landing, as in the sidebar), then its pages with favorite stars.
 */
function TopNavColumn({ row: { def, label }, location, onNavigate }: { row: TopNavRow; location: NavLocation; onNavigate: () => void }) {
  const active = isNavRowActive(def, location)
  const rowPages = useRowPages(def.appId ?? '', def.entry, active, def.pages)
  const favorites = useFavoritePages()
  // Same box as a PageRow (px-2, gap-2, 14px icon), so header and page texts share one left edge.
  const headerClass = 'flex h-8 items-center gap-2 rounded-md px-2 text-(length:--app-fs-13) font-semibold'
  // A row with pages never opens the module landing, so its header is a label, not a link: a primary
  // tint sets it apart from the page links under it (solid for the module on screen).
  const isLabel = Boolean(def.pages) && !def.href
  const iconTone = isLabel ? (active ? 'text-kumo-inverse' : 'text-kumo-brand') : active ? 'text-kumo-brand' : 'text-kumo-subtle'
  const icon = <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center ${iconTone}`}>{def.icon}</span>
  const header = def.href ? (
    <a href={def.href} target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={`${headerClass} text-kumo-strong hover:bg-kumo-tint`}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ArrowSquareOutIcon size={12} aria-hidden className="shrink-0 text-kumo-inactive" />
    </a>
  ) : isLabel ? (
    <div className={`${headerClass} ${active ? 'bg-kumo-brand text-kumo-inverse' : 'bg-kumo-brand/10 text-kumo-brand'}`}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </div>
  ) : (
    <Link {...linkProps(def)} {...preloadOf(def)} onClick={onNavigate} className={`${headerClass} text-kumo-strong hover:bg-kumo-tint`}>
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  )
  const appId = def.appId
  return (
    <div className="flex min-w-0 flex-col">
      {header}
      {appId && rowPages && rowPages.sections.length > 0 && (
        <ul aria-label={label} className="mt-1 flex flex-col gap-0.5">
          {rowPages.sections.map((section) => {
            const route = section.route
            return (
              <li key={section.id}>
                <PageRow
                  appId={appId}
                  section={section}
                  current={section.id === rowPages.current}
                  live={rowPages.live}
                  onOpen={onNavigate}
                  favorite={
                    route === undefined
                      ? undefined
                      : {
                          starred: isFavoritePage(favorites, appId, route),
                          toggle: () => toggleFavoritePage({ appId, route, label: section.label, group: label, kind: section.kind }),
                        }
                  }
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * A main row (or a one-row group) on the bar: an external link, a menu of the row's pages, or a link
 * to the row's screen.
 */
export function TopNavRowItem({ row, location, menu, onNavigate }: {
  row: TopNavRow
  location: NavLocation
  menu: TopNavMenuState
  onNavigate: () => void
}) {
  const { def, label } = row
  const active = isNavRowActive(def, location)
  const rowPages = useRowPages(def.appId ?? '', def.entry, active, def.pages)
  if (def.href) {
    return (
      <a href={def.href} target="_blank" rel="noopener noreferrer" title="Opens in a new tab" className={triggerClass(false)}>
        <TriggerFace label={label} trailing={<ArrowSquareOutIcon size={12} aria-hidden className="shrink-0 text-kumo-inactive" />} />
      </a>
    )
  }
  if (rowPages && rowPages.sections.length > 0) {
    return (
      <TopNavMenu face={<TriggerFace label={label} caret />} active={active} menu={menu} onPreload={preloadOf(def)}>
        <TopNavColumns rows={[row]} location={location} onNavigate={onNavigate} />
      </TopNavMenu>
    )
  }
  const preload = preloadOf(def)
  return (
    <Link
      {...linkProps(def)}
      {...preload}
      onPointerEnter={() => {
        menu.onHoverSwitch()
        preload?.onPointerEnter()
      }}
      className={triggerClass(active)}
    >
      <TriggerFace label={label} />
    </Link>
  )
}
