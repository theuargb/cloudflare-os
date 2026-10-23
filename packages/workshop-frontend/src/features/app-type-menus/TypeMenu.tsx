import { Fragment, useMemo, useState } from 'react'
import { DropdownMenu } from '@cloudflare/kumo'
import { CaretDownIcon } from '@phosphor-icons/react'
import type { AppMenuKind } from '@gadgets/workshop-shared/app-host'
import { MENU_CONTENT, MENU_ITEM, MENU_POSITIONER_STYLE } from '../../components/menuStyles'
import { useCloseOnFrameFocus } from '../../components/useCloseOnFrameFocus'
import { SPOTLIGHT_TYPES } from '../../components/Spotlight/catalog'
import { KindTile } from '../../components/Spotlight/kinds'
import type { SpotlightEntry } from '../../components/Spotlight/ranking'
import { getRecents, recordPick, type RecentEntry } from '../../components/Spotlight/recents'
import { KIND_ICONS } from '../app-section-nav/kindIcons'
import { typeMenuSections } from './typeMenuSections'

const HEADING = 'flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-kumo-inactive'

/**
 * One topbar dropdown of launcher actions of a menu kind («Документи», «Регістри», «Звіти»): the open
 * module first, then recent picks, then every module. Picks count as launcher picks (shared recents).
 */
export default function TypeMenu({ type, entries, openModule }: {
  type: AppMenuKind
  entries: SpotlightEntry[]
  /** `moduleKey` of the module on screen, or null. */
  openModule: string | null
}) {
  const [open, setOpen] = useState(false)
  useCloseOnFrameFocus(open, setOpen)
  // Recents and the open module are read on each open (recents change with every pick, here or in
  // Spotlight) and kept through the close: the popup stays on screen for its exit transition, and a
  // pick that opens another module must neither empty nor reorder it meanwhile.
  const [snapshot, setSnapshot] = useState<{ recents: RecentEntry[], openModule: string | null } | null>(null)
  const onOpenChange = (next: boolean) => {
    if (next) setSnapshot({ recents: getRecents(), openModule })
    setOpen(next)
  }
  const sections = useMemo(
    () => (snapshot ? typeMenuSections(entries, type, snapshot.openModule, snapshot.recents) : []),
    [entries, type, snapshot],
  )
  const label = SPOTLIGHT_TYPES.find((candidate) => candidate.type === type)!.label
  const Icon = KIND_ICONS[type]

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger
        render={
          <button
            type="button"
            className="press flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-kumo-line bg-kumo-base px-2.5 text-[13px] font-medium text-kumo-default transition-colors hover:bg-kumo-tint data-[popup-open]:bg-kumo-tint"
          >
            <Icon size={14} aria-hidden />
            {label}
            <CaretDownIcon size={12} aria-hidden />
          </button>
        }
      />
      <DropdownMenu.Content
        align="start"
        className={`${MENU_CONTENT} sidebar-scroll max-h-[min(70vh,560px)] w-80 overflow-y-auto`}
        style={MENU_POSITIONER_STYLE}
      >
        {sections.map((section, index) => (
          <Fragment key={section.id}>
            {index > 0 && <DropdownMenu.Separator />}
            <DropdownMenu.Group>
              <DropdownMenu.Label className={HEADING}>
                {section.icon && <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{section.icon}</span>}
                {section.heading}
              </DropdownMenu.Label>
              {section.groups.map((group) => (
                <Fragment key={group.title}>
                  {section.groups.length > 1 && group.title && (
                    <p className="px-2.5 pb-0.5 pt-1 text-[11px] text-kumo-subtle">{group.title}</p>
                  )}
                  {group.items.map((entry) => (
                    <DropdownMenu.Item
                      key={`${section.id}:${entry.id}`}
                      title={entry.section}
                      onClick={() => {
                        recordPick(entry.id)
                        entry.run()
                      }}
                      className={`${MENU_ITEM} flex items-center gap-2`}
                    >
                      <KindTile kind={entry.kind} size={20} />
                      <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                    </DropdownMenu.Item>
                  ))}
                </Fragment>
              ))}
            </DropdownMenu.Group>
          </Fragment>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
