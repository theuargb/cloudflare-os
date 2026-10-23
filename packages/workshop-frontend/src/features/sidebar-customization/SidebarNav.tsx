import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { CaretDown, PencilSimple } from '@phosphor-icons/react'
import type { GatekeeperAppInfo, GatekeeperAppNavigation } from '@gadgets/workshop-shared/api'
import SidebarItem from '../../components/AppShell/SidebarItem'
import AppSectionTree from '../app-section-nav/AppSectionTree'
import AppSectionFlyout from '../app-section-nav/AppSectionFlyout'
import { useOptionalAuthenticatedApi } from '../../AuthContext'
import { SidebarLabelEditor } from './SidebarLabelEditor'
import {
  EMPTY_SIDEBAR_LAYOUT,
  MAIN_CONTAINER,
  moveSidebarGroup,
  moveSidebarItem,
  readSidebarLayout,
  resolveSidebar,
  setSidebarLabel,
  writeSidebarLayout,
  type SidebarLayout,
} from './sidebarLayout'
import { buildSidebarDefaults, type SidebarItemDef } from './sidebarNavDefs'
import { useSidebarDrag, type DropIndicator } from './useSidebarDrag'

const CLOSED_GROUPS_KEY = 'workshop.sidebar.closedAppGroups'

const readClosedGroups = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CLOSED_GROUPS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

const DropLine = ({ indicator, id, inset }: { indicator: DropIndicator | null; id: string; inset: string }) =>
  indicator?.key === id ? (
    <span
      aria-hidden
      className={[
        'pointer-events-none absolute z-10 h-0.5 rounded-full bg-kumo-brand',
        inset,
        indicator.edge === 'top' ? '-top-px' : '-bottom-px',
      ].join(' ')}
    />
  ) : null

const RenameButton = ({ label, group, onClick }: { label: string; group?: 'section'; onClick: () => void }) => (
  <button
    type="button"
    aria-label={`Rename "${label}"`}
    title="Rename"
    onClick={(event) => {
      event.preventDefault()
      event.stopPropagation()
      onClick()
    }}
    className={[
      'flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-kumo-inactive opacity-0 transition-opacity hover:bg-kumo-fill hover:text-kumo-default focus-visible:opacity-100',
      group === 'section' ? 'group-hover/section:opacity-100' : 'group-hover/item:opacity-100',
    ].join(' ')}
  >
    <PencilSimple size={12} />
  </button>
)

/**
 * The sidebar's navigation: built-in rows, ungrouped module apps and module groups (or an app's own
 * sidebar tree from its navigation). Per-user order, group membership and labels are layered over the
 * module defaults and kept in localStorage.
 */
export const SidebarNav = ({ apps, navigation, collapsed, drawer }: {
  apps: GatekeeperAppInfo[]
  navigation: GatekeeperAppNavigation[]
  collapsed: boolean
  /** The mobile drawer instance (the open app's section tree shows in the drawer on mobile, in the rail on desktop). */
  drawer: boolean
}) => {
  const userId = useOptionalAuthenticatedApi()?.currentUser?.id ?? null
  return <SidebarNavContent key={userId ?? ''} userId={userId} apps={apps} navigation={navigation} collapsed={collapsed} drawer={drawer} />
}

const SidebarNavContent = ({
  userId,
  apps,
  navigation,
  collapsed,
  drawer,
}: {
  userId: string | null
  apps: GatekeeperAppInfo[]
  navigation: GatekeeperAppNavigation[]
  collapsed: boolean
  drawer: boolean
}) => {
  const [layout, setLayout] = useState<SidebarLayout>(() =>
    userId ? readSidebarLayout(userId) : EMPTY_SIDEBAR_LAYOUT,
  )
  const [closed, setClosed] = useState(readClosedGroups)
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const defaults = buildSidebarDefaults(apps, navigation)
  const resolved = resolveSidebar(defaults.structure, layout)
  const customizable = userId !== null && !collapsed

  const commit = (next: SidebarLayout) => {
    setLayout(next)
    if (userId) writeSidebarLayout(userId, next)
  }

  const drag = useSidebarDrag(
    resolved,
    (itemKey, container, beforeKey) => commit(moveSidebarItem(layout, resolved, itemKey, container, beforeKey)),
    (groupKey, beforeGroupKey) => commit(moveSidebarGroup(layout, resolved, groupKey, beforeGroupKey)),
  )

  const toggleGroup = (title: string) => {
    const next = closed.includes(title) ? closed.filter((item) => item !== title) : [...closed, title]
    setClosed(next)
    try {
      localStorage.setItem(CLOSED_GROUPS_KEY, JSON.stringify(next))
    } catch {
      // Storage disabled or full: the collapse state simply does not persist.
    }
  }

  const finishRename = (key: string, defaultLabel: string, label: string) => {
    commit(setSidebarLabel(layout, key, label, defaultLabel))
    setEditingKey(null)
  }

  const renderRow = (def: SidebarItemDef): ReactNode => {
    const label = layout.labels[def.key] ?? def.label
    if (editingKey === def.key && customizable) {
      return (
        <div
          key={def.key}
          className="flex h-11 items-center gap-2.5 rounded-lg bg-kumo-tint px-2.5 ring-2 ring-kumo-ring md:h-8"
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
        nested={def.appId && !collapsed ? <AppSectionTree appId={def.appId} entry={def.entry} drawer={drawer} /> : undefined}
        flyout={def.appId && collapsed ? (link) => <AppSectionFlyout appId={def.appId!} entry={def.entry} label={label}>{link}</AppSectionFlyout> : undefined}
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

  if (collapsed) {
    return (
      <>
        <nav aria-label="Primary" className="flex flex-col items-center gap-0.5 pt-2">
          {rows(resolved.main)}
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

  return (
    <>
      <nav
        aria-label="Primary"
        className="flex flex-col gap-0.5 px-2 pt-2"
        {...dragProps(drag.containerProps(MAIN_CONTAINER))}
      >
        {rows(resolved.main)}
      </nav>

      <nav aria-label="Modules" data-tour="sidebar-modules" className={resolved.groups.length > 0 ? 'flex flex-col' : 'hidden'}>
        {plainRuns(resolved.groups, customizable).map((run) => {
          // Outside customization a one-item group is just its row: adjacent ones stack as one plain list.
          if (run.plain) {
            return (
              <div key={run.groups[0]!.key} className="mt-3 flex flex-col gap-0.5 px-2">
                {run.groups.flatMap((group) => rows(group.items))}
              </div>
            );
          }
          const group = run.groups[0]!;
          const title = defaults.groupTitles.get(group.key) ?? group.key
          const label = layout.labels[group.key] ?? title
          const open = !closed.includes(title)
          const editing = editingKey === group.key
          const toggleOnKey = (event: KeyboardEvent<HTMLDivElement>) => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              toggleGroup(title)
            }
          }
          return (
            <section
              key={group.key}
              data-tour="sidebar-group"
              data-tour-group={title}
              className="relative mt-3 flex flex-col px-2"
              {...dragProps(drag.containerProps(group.key))}
            >
              <DropLine indicator={drag.dropIndicator} id={group.key} inset="inset-x-2" />
              {/* A div, not a button: Firefox does not start drags from <button>. */}
              <div
                {...(editing ? {} : { role: 'button', tabIndex: 0, onClick: () => toggleGroup(title), onKeyDown: toggleOnKey })}
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
                    <div className="flex h-8 items-center rounded-lg border border-dashed border-kumo-line px-2.5 text-[12px] text-kumo-inactive">
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
