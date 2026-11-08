import { Link, type LinkProps } from '@tanstack/react-router'
import { StarIcon } from '@phosphor-icons/react'
import type { AppNavSection } from '@gadgets/workshop-shared/app-host'
import { preloadAppRoute, preloadIntent } from '../app-preload/appPreload'
import { KIND_ICONS } from './kindIcons'
import { selectAppSection } from './sectionNavStore'

/**
 * One page of an app in the sidebar (a row's page list, its collapsed-rail flyout, the favorite
 * pages). A `live` page belongs to the open app and is picked over its channel; any other opens
 * `/gatekeepers/<appId>?at=<route>`. `onOpen` runs after a page other than the current one is picked.
 */
export function PageRow({ appId, section, current, live, detail, onOpen, favorite }: {
  appId: string
  section: AppNavSection
  current: boolean
  live: boolean
  /** Muted text after the label (a favorite's row name). */
  detail?: string
  onOpen?: () => void
  /** Shows the star that adds the page to (or removes it from) the favorite pages. */
  favorite?: { starred: boolean; toggle: () => void }
}) {
  const route = section.route
  if (!live && route === undefined) return null
  const KindIcon = section.kind ? KIND_ICONS[section.kind] : undefined
  const className = [
    'group flex h-11 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] transition-colors md:h-8 md:text-[13px]',
    current ? 'bg-kumo-fill font-medium text-kumo-strong' : 'cursor-pointer text-kumo-default hover:bg-kumo-tint',
    favorite ? 'pr-8' : '',
  ].join(' ')
  const content = (
    <>
      {KindIcon && (
        <KindIcon
          size={14}
          aria-hidden
          className={`shrink-0 transition-colors ${current ? 'text-kumo-brand' : 'text-kumo-subtle group-hover:text-kumo-default'}`}
        />
      )}
      <span className={`min-w-0 truncate ${detail ? 'max-w-[60%] shrink-0' : 'flex-1'}`}>{section.label}</span>
      {detail && <span className="min-w-0 flex-1 truncate text-[12px] font-normal text-kumo-inactive">{detail}</span>}
      {section.count !== undefined && (
        <span className={`shrink-0 text-[12px] tabular-nums ${current ? 'text-kumo-brand' : 'text-kumo-inactive'}`}>
          {section.count}
        </span>
      )}
    </>
  )
  // Kept loose: the generated route-tree union is stricter than is convenient here (as in SidebarItem).
  const linkProps = { to: '/gatekeepers/$appId', params: { appId }, search: { at: route } } as unknown as LinkProps
  const row = live ? (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      onClick={() => {
        if (current) return
        selectAppSection(appId, section.id)
        onOpen?.()
      }}
      className={className}
    >
      {content}
    </button>
  ) : (
    <Link
      {...linkProps}
      {...preloadIntent(() => preloadAppRoute(appId, route!))}
      aria-current={current ? 'page' : undefined}
      onClick={onOpen}
      // Pages are not dragged (stars collect them); only the row they nest under is a drag source.
      draggable={false}
      className={className}
    >
      {content}
    </Link>
  )
  if (!favorite) return row
  return (
    <div className="group/page relative">
      {row}
      <FavoriteStar starred={favorite.starred} onToggle={favorite.toggle} />
    </div>
  )
}

/** The star beside a page row (a sibling, never inside the row's button or link); on desktop hover-revealed until starred. */
function FavoriteStar({ starred, onToggle }: { starred: boolean; onToggle: () => void }) {
  const label = starred ? 'Remove from favorites' : 'Add to favorites'
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={starred}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onToggle()
      }}
      className={[
        'absolute inset-y-0 right-1 my-auto flex h-6 w-6 cursor-pointer items-center justify-center rounded-md transition-opacity hover:bg-kumo-fill focus-visible:opacity-100',
        starred ? 'text-kumo-brand' : 'text-kumo-inactive hover:text-kumo-default md:opacity-0 md:group-hover/page:opacity-100',
      ].join(' ')}
    >
      <StarIcon size={12} weight={starred ? 'fill' : 'regular'} />
    </button>
  )
}
