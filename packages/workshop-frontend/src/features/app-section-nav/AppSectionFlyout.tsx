import { cloneElement, useState, type ReactElement } from 'react'
import { Popover } from '@cloudflare/kumo'
import { SectionRow } from './AppSectionTree'
import { useAppSectionNav } from './sectionNavStore'

/**
 * The collapsed rail's stand-in for `AppSectionTree`: hovering the open app's icon tile opens its
 * sections beside the rail, titled with the row's label (which replaces the link's hover title).
 * Without published sections the tile is left as it is.
 */
export default function AppSectionFlyout({ appId, entry, label, children }: {
  appId: string
  /** The row's app entry: only the navigation published on it opens. */
  entry?: { id: string; first: boolean }
  label: string
  /** The row's link: becomes the hover trigger. */
  children: ReactElement<{ title?: string }>
}) {
  const nav = useAppSectionNav(appId, entry)
  const [open, setOpen] = useState(false)
  if (!nav || nav.sections.length === 0) return children

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
          {nav.sections.map((section) => (
            <li key={section.id}>
              <SectionRow appId={appId} active={nav.active} section={section} onSelect={() => setOpen(false)} />
            </li>
          ))}
        </ul>
      </Popover.Content>
    </Popover>
  )
}
