import { useState, type KeyboardEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Popover } from '@cloudflare/kumo'
import type { AppMenuKind } from '@gadgets/workshop-shared/app-host'
import { CaretDownIcon, ListIcon } from '@phosphor-icons/react'
import { useAuthenticatedApi } from '../../AuthContext'
import { GatekeeperAppIcon } from '../GatekeeperAppIcon'
import { KindTile } from '../Spotlight/kinds'
import { MENU_ITEM } from '../menuStyles'
import { opensScreen, type NavMenu } from './topNavModel'
import { revalidateAppNavigation } from './useAppNavigation'

type Current = { appId: string; route: string } | null

const HEADING = 'flex items-center gap-2 px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.06em] text-kumo-inactive'

/** The kind of the menu that holds the open screen, else the first kind. */
function kindOfScreen(menus: NavMenu[], current: Current): AppMenuKind {
  const holder = menus.find(({ modules }) =>
    modules.some(({ app, groups }) =>
      groups.some((group) => group.actions.some((action) => current?.appId === app.id && opensScreen(action, current.route)))))
  return (holder ?? menus[0]!).kind
}

/**
 * The single bordered Menu button of the top bar. Its popover holds a rail of screen kinds
 * (Documents … Classifiers) and, beside it, the launcher actions of the hovered kind grouped by
 * module — the same actions Spotlight (⌘K) runs. Settings are not listed: they are ⌘K-only.
 */
export default function AppMenu({ menus, current }: { menus: NavMenu[]; current: Current }) {
  const { authenticatedApi } = useAuthenticatedApi()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<AppMenuKind>(menus[0]!.kind)
  const holder = kindOfScreen(menus, current)
  const menu = menus.find((candidate) => candidate.kind === kind) ?? menus[0]!

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) return
    revalidateAppNavigation(authenticatedApi)
    setKind(holder)
  }

  const moveInRail = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const index = menus.findIndex((candidate) => candidate.kind === kind)
    const next = menus[(index + step + menus.length) % menus.length]!
    setKind(next.kind)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-kind="${next.kind}"]`)?.focus()
  }

  const showModuleTitles = menu.modules.length > 1

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        render={
          <button
            type="button"
            className="press flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-kumo-line bg-kumo-base px-2.5 text-[13px] font-medium text-kumo-default transition-colors hover:bg-kumo-tint data-[popup-open]:bg-kumo-tint"
          >
            <ListIcon size={14} aria-hidden />
            Menu
            <CaretDownIcon size={12} aria-hidden />
          </button>
        }
      />
      <Popover.Content
        align="start"
        sideOffset={6}
        className="themed-floating-shadow !z-[1100] !w-[min(1040px,calc(100vw-32px))] !min-w-0 h-[min(72vh,600px)] overflow-hidden rounded-xl bg-kumo-base p-0"
      >
        <div className="flex min-h-0 w-full flex-1">
          <div
            role="tablist"
            aria-orientation="vertical"
            onKeyDown={moveInRail}
            className="flex w-52 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-kumo-line p-1.5"
          >
            {menus.map((candidate) => {
              const selected = candidate.kind === menu.kind
              return (
                <button
                  key={candidate.kind}
                  type="button"
                  role="tab"
                  data-kind={candidate.kind}
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onPointerEnter={() => setKind(candidate.kind)}
                  onFocus={() => setKind(candidate.kind)}
                  onClick={() => setKind(candidate.kind)}
                  className={`flex h-8 cursor-pointer items-center justify-between rounded-md px-2.5 text-left text-[13px] transition-colors hover:bg-kumo-tint ${selected ? 'bg-kumo-tint font-medium text-kumo-strong' : candidate.kind === holder ? 'text-kumo-brand' : 'text-kumo-default'}`}
                >
                  <span>{candidate.label}</span>
                  <span className="text-[12px] tabular-nums text-kumo-inactive">{candidate.size}</span>
                </button>
              )
            })}
          </div>
          <div role="tabpanel" className="min-w-0 flex-1 overflow-y-auto p-3">
            <div className="mb-2 text-[15px] font-semibold text-kumo-strong">{menu.label}</div>
            <div className="columns-[240px] gap-4">
              {menu.modules.map(({ app, groups }) => {
                const showGroupTitles = groups.length > 1
                return (
                  <div key={app.id} className="pb-1">
                    {showModuleTitles && (
                      <div role="presentation" className={`${HEADING} break-after-avoid`}>
                        <GatekeeperAppIcon app={app} />
                        {app.title}
                      </div>
                    )}
                    {groups.map((group) => (
                      <div key={group.title} className="break-inside-avoid">
                        {showGroupTitles && group.title && (
                          <div role="presentation" className="px-2.5 pb-0.5 pt-1.5 text-[11px] text-kumo-subtle">{group.title}</div>
                        )}
                        {group.actions.map((action) => {
                          const isCurrent = current?.appId === app.id && opensScreen(action, current.route)
                          return (
                            <button
                              key={action.id}
                              type="button"
                              className={`${MENU_ITEM} flex w-full cursor-pointer items-center gap-2 text-left hover:bg-kumo-tint${isCurrent ? ' font-medium text-kumo-brand' : ''}`}
                              aria-current={isCurrent ? 'page' : undefined}
                              onClick={() => {
                                navigate({ to: '/gatekeepers/$appId', params: { appId: app.id }, search: { at: action.route } })
                                setOpen(false)
                              }}
                            >
                              <KindTile kind={action.kind} size={18} />
                              {action.title}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </Popover.Content>
    </Popover>
  )
}
