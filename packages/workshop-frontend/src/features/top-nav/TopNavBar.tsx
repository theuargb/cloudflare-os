import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Popover } from '@cloudflare/kumo'
import { ArrowLeftIcon, ArrowSquareOutIcon, HexagonIcon, MagnifyingGlassIcon, SidebarSimpleIcon, StackIcon, StarIcon } from '@phosphor-icons/react'
import { useSiteName } from '../../ServerConfigContext'
import SiteLogo from '../../components/SiteLogo'
import { useGatekeeperApps } from '../../useGatekeeperApps'
import { useAppNavigation } from '../../components/AppNavigation/useAppNavigation'
import { isNavRowActive, useNavLocation } from '../../components/AppShell/navRowActive'
import { SidebarWorkspacesLists, SidebarWorkspacesProvider } from '../../components/AppShell/SidebarWorkspaces'
import SidebarUtilityStrip from '../../components/AppShell/SidebarUtilityStrip'
import { useCloseOnFrameFocus } from '../../components/useCloseOnFrameFocus'
import { openCommandPalette } from '../../components/AppShell/commandPaletteBus'
import { FavoriteList } from '../app-section-nav/FavoritePages'
import { useFavoritePages } from '../app-section-nav/favoritePages'
import { inNativeApp, returnToInstalls } from '../native-app/nativeApp'
import { UnreadSummary } from '../notifications/UnreadSummary'
import { useUserPreference } from '../user-preferences/userPreferences'
import { SIDEBAR_LAYOUT_PREFERENCE, parseSidebarLayout, resolveSidebar } from '../sidebar-customization/sidebarLayout'
import { buildSidebarDefaults } from '../sidebar-customization/sidebarNavDefs'
import { topNavItems, type TopNavItem } from './topNavItems'
import { PANEL_TITLE, TopNavMenu, TriggerFace, triggerClass, type TopNavMenuState } from './TopNavMenu'
import { TopNavColumns, TopNavRowItem } from './TopNavColumn'
import { useFitCount } from './useFitCount'

const ICON_BUTTON =
  'flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-kumo-inactive transition-colors hover:bg-kumo-tint hover:text-kumo-default'
/** The sidebar brand row's buttons (Sidebar.tsx), so both layouts show the same icon group. */
const BRAND_BUTTON =
  'press flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-kumo-inactive transition-colors hover:bg-kumo-tint hover:text-kumo-default'

/** The face an item shows on the bar (also rendered in the hidden measuring row): text only, a caret on menus. */
function itemFace(item: TopNavItem) {
  if (item.kind === 'group') return <TriggerFace label={item.title} caret />
  const external = item.def.href ? <ArrowSquareOutIcon size={12} aria-hidden className="shrink-0" /> : undefined
  return <TriggerFace label={item.label} caret={item.def.pages !== undefined} trailing={external} />
}

/**
 * The desktop navigation as a horizontal bar above the topbar (the `top` nav layout): the sidebar's
 * rows and module groups in the user's order and labels, each group a full-width megamenu of its
 * modules and their pages; what does not fit goes to «More». One menu is open at a time: click opens,
 * hovering another trigger while one is open switches to it.
 */
export default function TopNavBar({ onMoveToSidebar }: { onMoveToSidebar: () => void }) {
  const siteName = useSiteName()
  const apps = useGatekeeperApps()
  const navigation = useAppNavigation()
  const rawLayout = useUserPreference(SIDEBAR_LAYOUT_PREFERENCE)
  const layout = useMemo(() => parseSidebarLayout(rawLayout), [rawLayout])
  const defaults = buildSidebarDefaults(apps, navigation)
  const items = topNavItems(defaults, resolveSidebar(defaults.structure, layout), layout.labels)
  const location = useNavLocation()
  const favorites = useFavoritePages().filter((page) => apps.some((app) => app.id === page.appId))

  const [openKey, setOpenKey] = useState<string | null>(null)
  const closeAll = useCallback(() => setOpenKey(null), [])
  const onFrameFocus = useCallback((open: boolean) => {
    if (!open) setOpenKey(null)
  }, [])
  useCloseOnFrameFocus(openKey !== null, onFrameFocus)
  const href = useRouterState({ select: (s) => s.location.href })
  useEffect(() => setOpenKey(null), [href])
  const menu = (key: string): TopNavMenuState => ({
    open: openKey === key,
    onOpenChange: (next) => setOpenKey((current) => (next ? key : current === key ? null : current)),
    onHoverSwitch: () => setOpenKey((current) => (current !== null && current !== key ? key : current)),
  })

  const barRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const signature = items.map((item) => `${item.key}:${item.kind === 'group' ? item.title : item.label}`).join('|')
  const fit = Math.min(useFitCount(trackRef, measureRef, signature), items.length)
  const shown = items.slice(0, fit)
  const overflow = items.slice(fit)

  const itemActive = (item: TopNavItem) =>
    item.kind === 'group' ? item.rows.some((row) => isNavRowActive(row.def, location)) : isNavRowActive(item.def, location)

  const renderItem = (item: TopNavItem) =>
    item.kind === 'group' ? (
      <TopNavMenu key={item.key} face={itemFace(item)} active={itemActive(item)} menu={menu(item.key)} anchor={barRef}>
        <Popover.Title className={PANEL_TITLE}>{item.title}</Popover.Title>
        <TopNavColumns rows={item.rows} location={location} onNavigate={closeAll} />
      </TopNavMenu>
    ) : (
      <TopNavRowItem key={item.key} row={item} location={location} menu={menu(item.key)} onNavigate={closeAll} />
    )

  return (
    <SidebarWorkspacesProvider>
      <header
        ref={barRef}
        aria-label="Primary navigation"
        className="hidden h-14 shrink-0 items-center gap-1 border-b border-kumo-line bg-kumo-elevated pr-3 md:flex"
      >
        {/* The sidebar's brand row, same width and buttons, so the logo stays put when the layout changes. */}
        <div className="flex h-full w-[260px] shrink-0 items-center justify-between gap-2 border-r border-kumo-line px-3">
          <Link to="/" aria-label={siteName} className="flex min-w-0 items-center gap-2">
            <SiteLogo size={20} className="shrink-0">
              <HexagonIcon size={20} weight="bold" className="text-kumo-brand shrink-0" />
            </SiteLogo>
            <span className="truncate text-(length:--app-fs-14) leading-(--app-lh-20) font-semibold tracking-[-0.25px] text-kumo-default">
              {siteName}
            </span>
          </Link>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={() => openCommandPalette()} aria-label="Search" title="Search (⌘K)" className={BRAND_BUTTON}>
              <MagnifyingGlassIcon size={15} />
            </button>
            <button
              type="button"
              onClick={onMoveToSidebar}
              aria-label="Move navigation to the sidebar"
              title="Move navigation to the sidebar"
              className={BRAND_BUTTON}
            >
              <SidebarSimpleIcon size={15} />
            </button>
          </div>
        </div>
        {favorites.length > 0 && (
          <div className="ml-2 shrink-0">
            <TopNavMenu
              face={<StarIcon size={16} weight="fill" className="text-kumo-brand" />}
              label="Favorite pages"
              active={false}
              menu={menu('favorites')}
              wide
            >
              <FavoriteList favorites={favorites} onOpen={closeAll} />
            </TopNavMenu>
          </div>
        )}

        <nav ref={trackRef} aria-label="Primary" className="relative ml-2 flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          {shown.map(renderItem)}
          {overflow.length > 0 && (
            <TopNavMenu
              face={<TriggerFace label="More" caret />}
              active={overflow.some(itemActive)}
              menu={menu('more')}
              anchor={barRef}
            >
              <div className="flex flex-col gap-4">
                {overflow.map((item) => (
                  <section key={item.key} className="flex flex-col">
                    {item.kind === 'group' && <h3 className={PANEL_TITLE}>{item.title}</h3>}
                    <TopNavColumns rows={item.kind === 'group' ? item.rows : [item]} location={location} onNavigate={closeAll} />
                  </section>
                ))}
              </div>
            </TopNavMenu>
          )}
          <div
            ref={measureRef}
            aria-hidden
            className="pointer-events-none invisible absolute left-0 top-0 flex gap-0.5 whitespace-nowrap"
          >
            {items.map((item) => (
              <span key={item.key} className={triggerClass(false)}>
                {itemFace(item)}
              </span>
            ))}
            <span className={triggerClass(false)}>
              <TriggerFace label="More" caret />
            </span>
          </div>
        </nav>

        <TopNavMenu face={<StackIcon size={16} />} label="Workspaces" active={false} menu={menu('workspaces')} wide>
          <div className="pt-1">
            <UnreadSummary collapsed={false} />
            <SidebarWorkspacesLists />
          </div>
        </TopNavMenu>
        <SidebarUtilityStrip layout="top" />
        {inNativeApp() && (
          <button type="button" onClick={returnToInstalls} aria-label="Back to installs" title="Back to installs" className={ICON_BUTTON}>
            <ArrowLeftIcon size={16} aria-hidden="true" />
          </button>
        )}
      </header>
    </SidebarWorkspacesProvider>
  )
}
