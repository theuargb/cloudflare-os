import { useState, type ReactElement } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { Popover } from '@cloudflare/kumo'
import { CaretDownIcon, StarIcon } from '@phosphor-icons/react'
import type { GatekeeperAppInfo } from '@gadgets/workshop-shared/api'
import { toggleFavoritePage, useFavoritePages, type FavoritePage } from './favoritePages'
import { PageRow } from './PageRow'
import { routePath, searchAt } from './sectionPages'

const LABEL = 'Favorite pages'

/**
 * The user's starred pages from any apps, directly under Home: a collapsible list in the expanded
 * rail and the drawer, a star tile with a hover flyout in the collapsed rail. Pages of apps that are
 * not available are hidden (kept starred); nothing renders without a visible favorite.
 */
export default function FavoritePages({ apps, collapsed, open, onToggle }: {
  apps: GatekeeperAppInfo[]
  collapsed: boolean
  open: boolean
  /** Opens or closes the list; gets the header to reveal the opened rows. */
  onToggle: (header: HTMLElement) => void
}) {
  const favorites = useFavoritePages().filter((page) => apps.some((app) => app.id === page.appId))
  if (favorites.length === 0) return null
  if (collapsed) return <FavoritesFlyout favorites={favorites} />

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={(event) => onToggle(event.currentTarget)}
        className="group flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] leading-5 text-kumo-default transition-colors hover:bg-kumo-tint md:h-7 md:text-[13px] md:leading-[18px]"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-kumo-brand">
          <StarIcon size={16} weight="fill" />
        </span>
        <span className="min-w-0 flex-1 truncate">{LABEL}</span>
        <span className="shrink-0 text-[12px] tabular-nums text-kumo-inactive">{favorites.length}</span>
        <CaretDownIcon
          size={10}
          aria-hidden
          className={`shrink-0 text-kumo-inactive transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <div role="navigation" aria-label={LABEL} className="mb-1 ml-[19px] mt-0.5 border-l border-kumo-line pl-2">
          <FavoriteList favorites={favorites} />
        </div>
      )}
    </div>
  )
}

/** The collapsed rail's star tile: hovering it opens the favorite pages beside the rail. */
function FavoritesFlyout({ favorites }: { favorites: FavoritePage[] }) {
  const [open, setOpen] = useState(false)
  const tile: ReactElement = (
    <button
      type="button"
      aria-label={LABEL}
      className="mx-auto flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-kumo-brand transition-colors hover:bg-kumo-tint"
    >
      <StarIcon size={16} weight="fill" />
    </button>
  )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger openOnHover delay={80} closeDelay={150} render={tile} />
      <Popover.Content
        side="right"
        align="start"
        sideOffset={10}
        className="!z-[1100] !w-[260px] !min-w-0 flex max-h-[min(70vh,480px)] flex-col overflow-hidden rounded-xl bg-kumo-base p-1 shadow-lg shadow-kumo-tip-shadow"
      >
        <Popover.Title className="shrink-0 truncate px-2 pt-1.5 pb-1 text-[11px] leading-4 font-medium uppercase tracking-[0.06em] text-kumo-inactive">
          {LABEL}
        </Popover.Title>
        <div role="navigation" aria-label={LABEL} className="min-h-0 flex-1 overflow-y-auto">
          <FavoriteList favorites={favorites} onOpen={() => setOpen(false)} />
        </div>
      </Popover.Content>
    </Popover>
  )
}

function FavoriteList({ favorites, onOpen }: { favorites: FavoritePage[]; onOpen?: () => void }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const openAt = useRouterState({ select: (state) => searchAt(state.location.search) })
  const openPath = openAt === null ? null : routePath(openAt)
  return (
    <ul className="flex flex-col gap-0.5">
      {favorites.map((page) => (
        <li key={`${page.appId}:${page.route}`}>
          <PageRow
            appId={page.appId}
            section={{ id: page.route, label: page.label, kind: page.kind, route: page.route }}
            current={pathname === `/gatekeepers/${page.appId}` && openPath === routePath(page.route)}
            live={false}
            detail={page.group}
            onOpen={onOpen}
            favorite={{ starred: true, toggle: () => toggleFavoritePage(page) }}
          />
        </li>
      ))}
    </ul>
  )
}
