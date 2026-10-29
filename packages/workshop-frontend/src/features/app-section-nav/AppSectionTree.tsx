import { useEffect, useRef } from 'react'
import type { AppNavSection } from '@gadgets/workshop-shared/app-host'
import { revealBelow } from '../sidebar-customization/revealInSidebar'
import { isFavoritePage, toggleFavoritePage, useFavoritePages } from './favoritePages'
import { PageRow } from './PageRow'
import { useDesktop } from './sectionNavHooks'
import { useRowPages } from './sectionPages'

/**
 * The pages nested under an open sidebar row, in the expanded desktop rail and in the mobile drawer
 * (the collapsed rail opens them in a hover flyout, `AppSectionFlyout`): the open app's live
 * sections while the row's screen is on screen, else the row's own pages. Filter chips stay in the page.
 */
export default function AppSectionTree({ appId, entry, drawer, rowLabel, active, pages }: {
  appId: string
  /** The row's app entry: the tree shows only the navigation published on it. */
  entry?: { id: string; first: boolean }
  drawer: boolean
  /** The sidebar row's label: a starred page names it, so pages of different apps stay distinct. */
  rowLabel: string
  /** The row's screen is on screen. */
  active: boolean
  /** The row's own pages (`AppEntry.sections`). */
  pages?: AppNavSection[]
}) {
  const rowPages = useRowPages(appId, entry, active, pages)
  const favorites = useFavoritePages()
  const desktop = useDesktop()
  const ref = useRef<HTMLDivElement>(null)
  // Both rail instances exist on every screen: show the one that is visible.
  const shown = rowPages !== null && drawer !== desktop
  // A row opened low in the rail scrolls its pages into view (once per opening, not per page switch).
  const revealKey = shown ? `${appId}:${entry?.id ?? ''}` : null
  useEffect(() => {
    const tree = ref.current
    if (revealKey && tree) revealBelow((tree.previousElementSibling as HTMLElement | null) ?? tree, tree)
  }, [revealKey])
  if (!rowPages || !shown) return null

  return (
    <div
      ref={ref}
      role="navigation"
      aria-label="Sections"
      data-tour={active ? 'section-nav' : undefined}
      className="mb-1 ml-[19px] mt-0.5 border-l border-kumo-line pl-2"
    >
      <ul className="flex flex-col gap-0.5">
        {rowPages.sections.map((section) => {
          const route = section.route
          return (
            <li key={section.id}>
              <PageRow
                appId={appId}
                section={section}
                current={section.id === rowPages.current}
                live={rowPages.live}
                favorite={
                  route === undefined
                    ? undefined
                    : {
                        starred: isFavoritePage(favorites, appId, route),
                        toggle: () =>
                          toggleFavoritePage({ appId, route, label: section.label, group: rowLabel, kind: section.kind }),
                      }
                }
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
