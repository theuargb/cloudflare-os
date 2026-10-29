import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { useRouterState } from '@tanstack/react-router'
import type { GatekeeperAppInfo, GatekeeperAppNavigation } from '@gadgets/workshop-shared/api'
import SidebarItem from '../../components/AppShell/SidebarItem'
import { useWarmGatekeeperApp } from '../../KeptGatekeeperApp'
import AppSectionTree from '../app-section-nav/AppSectionTree'
import AppSectionFlyout from '../app-section-nav/AppSectionFlyout'
import FavoritePages from '../app-section-nav/FavoritePages'
import { preloadAppRoute } from '../app-preload/appPreload'
import { useOptionalAuthenticatedApi } from '../../AuthContext'
import { useUserPreference, writeUserPreference } from '../user-preferences/userPreferences'
import { SidebarLabelEditor } from './SidebarLabelEditor'
import { DropLine, RenameButton } from './SidebarNavControls'
import { revealBelow } from './revealInSidebar'
import {
  MAIN_CONTAINER,
  SIDEBAR_LAYOUT_PREFERENCE,
  moveSidebarGroup,
  moveSidebarItem,
  parseSidebarLayout,
  resolveSidebar,
  setSidebarLabel,
  type SidebarLayout,
} from './sidebarLayout'
import { buildSidebarDefaults, type SidebarItemDef } from './sidebarNavDefs'
import { GROUP_ATTRIBUTE, useSidebarDrag } from './useSidebarDrag'

/** User preference key of the closed groups (JSON array of container keys). */
const CLOSED_GROUPS_PREFERENCE = 'sidebar.closed-groups'

const parseClosedGroups = (raw: string | null): string[] => {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** Closed-groups key of the favorite pages block. */
const FAVORITES_KEY = 'favorites'
const HOME_KEY = 'builtin:home'

/**
 * The sidebar's navigation: built-in rows, the user's favorite pages, ungrouped module apps and
 * module groups (or an app's own sidebar tree from its navigation). Per-user order, group
 * membership, labels and closed groups are layered over the module defaults and kept on the server
 * (user preferences), so every browser of the user shows the same sidebar.
 */
export const SidebarNav = ({
  apps,
  navigation,
  collapsed,
  drawer,
}: {
  apps: GatekeeperAppInfo[]
  navigation: GatekeeperAppNavigation[]
  collapsed: boolean
  /** The mobile drawer instance (the open app's section tree shows in the drawer on mobile, in the rail on desktop). */
  drawer: boolean
}) => {
  const signedIn = useOptionalAuthenticatedApi()?.currentUser != null
  const rawLayout = useUserPreference(SIDEBAR_LAYOUT_PREFERENCE)
  const layout = useMemo(() => parseSidebarLayout(rawLayout), [rawLayout])
  const rawClosed = useUserPreference(CLOSED_GROUPS_PREFERENCE)
  const closed = useMemo(() => parseClosedGroups(rawClosed), [rawClosed])
  const [editingKey, setEditingKey] = useState<string | null>(null)
  // Per-row overrides of the default open state (open while active), this rail instance only.
  const href = useRouterState({ select: (state) => state.location.href })
  const [expanded, setExpanded] = useState<{ href: string; rows: Record<string, boolean> }>({ href, rows: {} })
  const openRows = expanded.href === href ? expanded.rows : {}
  const warmApp = useWarmGatekeeperApp()

  const defaults = buildSidebarDefaults(apps, navigation)
  const resolved = resolveSidebar(defaults.structure, layout)
  const customizable = signedIn && !collapsed

  const commit = (next: SidebarLayout) => writeUserPreference(SIDEBAR_LAYOUT_PREFERENCE, JSON.stringify(next))
  const commitClosed = (next: string[]) => writeUserPreference(CLOSED_GROUPS_PREFERENCE, JSON.stringify(next))

  const drag = useSidebarDrag(
    resolved,
    (itemKey, container, beforeKey) => commit(moveSidebarItem(layout, resolved, itemKey, container, beforeKey)),
    (groupKey, beforeGroupKey) => commit(moveSidebarGroup(layout, resolved, groupKey, beforeGroupKey)),
  )

  // Opening a group low in the rail scrolls its rows into view (the header stays visible).
  const toggleGroup = (key: string, header: HTMLElement) => {
    const opening = closed.includes(key)
    commitClosed(opening ? closed.filter((item) => item !== key) : [...closed, key])
    if (opening) requestAnimationFrame(() => revealBelow(header, header.parentElement ?? header))
  }

  const finishRename = (key: string, defaultLabel: string, label: string) => {
    commit(setSidebarLabel(layout, key, label, defaultLabel))
    setEditingKey(null)
  }

  // A row with pages opens in place (its tree scrolls itself into view); opening one closes the
  // others the user opened. Overrides last until the next navigation, which opens the active row.
  // Opening also readies the module: the running app loads its code, a cold one boots hidden there.
  const toggleRow = (def: SidebarItemDef, open: boolean) => {
    setExpanded({
      href,
      rows: { ...Object.fromEntries(Object.entries(openRows).filter(([, value]) => !open || !value)), [def.key]: open },
    })
    const route = def.search?.at ?? ''
    if (open && def.appId && !preloadAppRoute(def.appId, route)) warmApp(def.appId, route)
  }

  const renderRow = (def: SidebarItemDef): ReactNode => {
    const label = layout.labels[def.key] ?? def.label
    if (editingKey === def.key && customizable) {
      return (
        <div
          key={def.key}
          className="flex h-11 items-center gap-2.5 rounded-lg bg-kumo-tint px-2.5 ring-2 ring-kumo-ring md:h-7"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center text-kumo-subtle">{def.icon}</span>
          <SidebarLabelEditor
            initialValue={label}
            defaultLabel={def.label}
            onCommit={(value) => finishRename(def.key, def.label, value)}
            onCancel={() => setEditingKey(null)}
          />
        </div>
      )
    }
    const item = (
      <SidebarItem
        to={def.to}
        href={def.href}
        params={def.params}
        search={def.search}
        entry={def.entry}
        label={label}
        icon={def.icon}
        collapsed={collapsed}
        endAction={customizable ? <RenameButton label={label} onClick={() => setEditingKey(def.key)} /> : undefined}
        nested={def.appId && !collapsed ? (active) => <AppSectionTree appId={def.appId!} entry={def.entry} drawer={drawer} rowLabel={label} active={active} pages={def.pages} /> : undefined}
        flyout={def.appId && collapsed ? (link, active) => <AppSectionFlyout appId={def.appId!} entry={def.entry} label={label} active={active} pages={def.pages}>{link}</AppSectionFlyout> : undefined}
        preload={def.appId ? () => preloadAppRoute(def.appId!, def.search?.at ?? '') : undefined}
        pages={def.pages ? { open: openRows[def.key], onToggle: (open) => toggleRow(def, open), draggable: customizable } : undefined}
      />
    )
    if (!customizable) return <div key={def.key}>{item}</div>
    return (
      <div key={def.key} className="relative" {...drag.rowProps(def.key)}>
        <DropLine indicator={drag.dropIndicator} id={def.key} inset="inset-x-0" />
        {item}
      </div>
    )
  }

  const rows = (keys: string[]) =>
    keys.flatMap((key) => {
      const def = defaults.items.get(key)
      return def ? [renderRow(def)] : []
    })

  // Favorite pages sit right under Home (first when the user dragged Home elsewhere).
  const favorites = (
    <FavoritePages
      key={FAVORITES_KEY}
      apps={apps}
      collapsed={collapsed}
      open={!closed.includes(FAVORITES_KEY)}
      onToggle={(header) => toggleGroup(FAVORITES_KEY, header)}
    />
  )
  const primary =
    resolved.main[0] === HOME_KEY
      ? [...rows(resolved.main.slice(0, 1)), favorites, ...rows(resolved.main.slice(1))]
      : [favorites, ...rows(resolved.main)]

  if (collapsed) {
    return (
      <>
        <nav aria-label="Primary" className="flex flex-col items-center gap-0.5 pt-2">
          {primary}
        </nav>
        {resolved.groups.some((group) => group.items.length > 0) && (
          <nav aria-label="Modules" data-tour="sidebar-modules" className="flex flex-col items-center gap-0.5 pt-2">
            {resolved.groups.flatMap((group) => rows(group.items))}
          </nav>
        )}
      </>
    )
  }

  const dragProps = (props: object) => (customizable ? props : {})
  // While a group is dragged every group shows its header only: the only drop positions are between groups.
  const groupDrag = drag.dragging?.kind === 'group'

  return (
    <>
      <nav
        aria-label="Primary"
        className="flex flex-col gap-0.5 px-2 pt-2"
        {...dragProps(drag.itemZoneProps(MAIN_CONTAINER))}
      >
        {primary}
      </nav>

      <nav
        aria-label="Modules"
        data-tour="sidebar-modules"
        className={resolved.groups.length > 0 ? 'flex flex-col' : 'hidden'}
        {...dragProps(drag.groupListProps())}
      >
        {plainRuns(resolved.groups, customizable).map((run) => {
          // Outside customization a one-item group is just its row: adjacent ones stack as one plain list.
          if (run.plain) {
            return (
              <div key={run.groups[0]!.key} className="mt-2 flex flex-col gap-0.5 px-2">
                {run.groups.flatMap((group) => rows(group.items))}
              </div>
            );
          }
          const group = run.groups[0]!;
          const title = defaults.groupTitles.get(group.key) ?? group.key
          const label = layout.labels[group.key] ?? title
          const open = !closed.includes(group.key) && !groupDrag
          const editing = editingKey === group.key
          const toggleOnKey = (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleGroup(group.key, event.currentTarget)
            }
          }
          return (
            <section
              key={group.key}
              {...{ [GROUP_ATTRIBUTE]: group.key }}
              data-tour="sidebar-group"
              data-tour-group={title}
              className={[
                'relative mt-2 flex flex-col px-2',
                drag.dragging?.key === group.key ? 'opacity-50' : '',
              ].join(' ')}
              {...dragProps(drag.itemZoneProps(group.key))}
            >
              <DropLine indicator={drag.dropIndicator} id={group.key} inset="inset-x-2" />
              {/* A div, not a button: Firefox does not start drags from <button>. */}
              <div
                {...(editing
                  ? {}
                  : {
                      role: 'button',
                      tabIndex: 0,
                      onClick: (event: MouseEvent<HTMLDivElement>) => toggleGroup(group.key, event.currentTarget),
                      onKeyDown: toggleOnKey,
                    })}
                {...(customizable && !editing ? drag.groupHandleProps(group.key) : {})}
                aria-expanded={editing ? undefined : open}
                className={[
                  'group/section flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-kumo-inactive transition-colors hover:text-kumo-subtle',
                  editing ? '' : 'cursor-pointer',
                  drag.dropContainer === group.key ? 'bg-kumo-tint' : '',
                ].join(' ')}
              >
                <CaretDown
                  size={10}
                  weight="bold"
                  className={['shrink-0 transition-transform', open ? '' : '-rotate-90'].join(' ')}
                />
                {editing ? (
                  <SidebarLabelEditor
                    initialValue={label}
                    defaultLabel={title}
                    onCommit={(value) => finishRename(group.key, title, value)}
                    onCancel={() => setEditingKey(null)}
                  />
                ) : (
                  <>
                    <span className="min-w-0 truncate">{label}</span>
                    <span className="ml-1 text-kumo-inactive">{group.items.length}</span>
                    {customizable && (
                      <span className="ml-auto">
                        <RenameButton label={label} group="section" onClick={() => setEditingKey(group.key)} />
                      </span>
                    )}
                  </>
                )}
              </div>
              {open && (
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {rows(group.items)}
                  {customizable && group.items.length === 0 && (
                    <div className="flex h-7 items-center rounded-lg border border-dashed border-kumo-line px-2.5 text-[12px] text-kumo-inactive">
                      Drag an item here
                    </div>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </nav>
    </>
  )
};

type GroupRun<G> = { plain: boolean; groups: G[] };

/** Groups in order; outside customization, consecutive one-item groups merge into one plain run. */
function plainRuns<G extends { key: string; items: string[] }>(
  groups: readonly G[],
  customizable: boolean,
): GroupRun<G>[] {
  const runs: GroupRun<G>[] = [];
  for (const group of groups) {
    const plain = !customizable && group.items.length === 1;
    const last = runs.at(-1);
    if (plain && last?.plain) last.groups.push(group);
    else runs.push({ plain, groups: [group] });
  }
  return runs;
}
