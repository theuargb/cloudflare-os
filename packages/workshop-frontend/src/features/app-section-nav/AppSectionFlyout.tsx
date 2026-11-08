import { cloneElement, useState, type ReactElement } from 'react'
import { Popover } from '@cloudflare/kumo'
import type { AppNavSection } from '@gadgets/workshop-shared/app-host'
import { PageRow } from './PageRow'
import { useRowPages } from './sectionPages'

/**
 * The collapsed rail's stand-in for `AppSectionTree`: hovering (or clicking) a row's icon tile opens
 * its pages beside the rail, titled with the row's label (which replaces the tile's hover title).
 * Without pages the tile is left as it is.
 */
export default function AppSectionFlyout({ appId, entry, label, active, pages, children }: {
  appId: string
  /** The row's app entry: only the navigation published on it opens. */
  entry?: { id: string; first: boolean }
  label: string
  /** The row's screen is on screen. */
  active: boolean
  /** The row's own pages (`AppEntry.sections`). */
  pages?: AppNavSection[]
  /** The row's tile: becomes the hover trigger. */
  children: ReactElement<{ title?: string }>
}) {
  const rowPages = useRowPages(appId, entry, active, pages)
  const [open, setOpen] = useState(false)
  if (!rowPages || rowPages.sections.length === 0) return children

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger openOnHover delay={80} closeDelay={150} render={cloneElement(children, { title: undefined })} />
      <Popover.Content
        side="right"
        align="start"
        sideOffset={10}
        className="!z-[1100] !w-[240px] !min-w-0 flex max-h-[min(70vh,480px)] flex-col overflow-hidden rounded-xl bg-kumo-base p-1 shadow-lg shadow-kumo-tip-shadow"
      >
        <Popover.Title className="shrink-0 truncate px-2 pt-1.5 pb-1 text-[11px] leading-4 font-medium uppercase tracking-[0.06em] text-kumo-inactive">
          {label}
        </Popover.Title>
        <ul role="navigation" aria-label="Sections" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          {rowPages.sections.map((section) => (
            <li key={section.id}>
              <PageRow
                appId={appId}
                section={section}
                current={section.id === rowPages.current}
                live={rowPages.live}
                onOpen={() => setOpen(false)}
              />
            </li>
          ))}
        </ul>
      </Popover.Content>
    </Popover>
  )
}
