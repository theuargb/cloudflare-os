import type { ReactNode } from 'react'
import type { LinkProps } from '@tanstack/react-router'
import { House } from '@phosphor-icons/react'
import type { GatekeeperAppInfo } from '@gadgets/workshop-shared/api'
import { GatekeeperAppIcon } from '../../components/GatekeeperAppIcon'
import type { SidebarStructure } from './sidebarLayout'

export type SidebarItemDef = {
  key: string
  label: string
  to: LinkProps['to']
  params?: LinkProps['params']
  /** Search params of the link: an app entry row opens the app at the entry's route (`at`). */
  search?: { at: string }
  /** Set on the rows of an app that publishes several entries; drives the active highlight. */
  entry?: { id: string; first: boolean }
  icon: ReactNode
}

export type SidebarNavDefaults = {
  structure: SidebarStructure
  items: Map<string, SidebarItemDef>
  /** Module-declared group titles by container key. */
  groupTitles: Map<string, string>
}

const HOME: SidebarItemDef = {
  key: 'builtin:home',
  label: 'Home',
  to: '/',
  icon: <House size={14} weight="regular" />,
}

/** One row for a single-area app, one row per entry for an app that publishes `entries`. */
const appItems = (app: GatekeeperAppInfo): SidebarItemDef[] => {
  const base = { to: '/gatekeepers/$appId' as LinkProps['to'], params: { appId: app.id } as LinkProps['params'] }
  if (!app.entries) return [{ ...base, key: `app:${app.id}`, label: app.title, icon: <GatekeeperAppIcon app={app} /> }]
  return app.entries.map((entry, index) => ({
    ...base,
    key: `app:${app.id}:${entry.id}`,
    label: entry.title,
    search: { at: entry.route },
    entry: { id: entry.id, first: index === 0 },
    icon: <GatekeeperAppIcon app={{ ...app, icon: entry.icon ?? app.icon }} />,
  }))
}

/** The sidebar as modules declare it: Home, ungrouped apps, then one group per `VendorDescription.group`, in the order `apps` arrives (the backend sorts by group, then item order). */
export const buildSidebarDefaults = (apps: GatekeeperAppInfo[]): SidebarNavDefaults => {
  const items = new Map<string, SidebarItemDef>()
  const add = (def: SidebarItemDef): string => {
    items.set(def.key, def)
    return def.key
  }

  const main = [add(HOME), ...apps.filter((app) => !app.group).flatMap(appItems).map(add)]

  const groupTitles = new Map<string, string>()
  const groups: { key: string; items: string[] }[] = []
  for (const app of apps) {
    if (!app.group) continue
    const key = `group:${app.group.title}`
    let group = groups.find((candidate) => candidate.key === key)
    if (!group) {
      group = { key, items: [] }
      groups.push(group)
      groupTitles.set(key, app.group.title)
    }
    group.items.push(...appItems(app).map(add))
  }

  return { structure: { main, groups }, items, groupTitles }
}
