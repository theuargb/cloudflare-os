import type { ReactNode } from 'react'
import type { LinkProps } from '@tanstack/react-router'
import { Blueprint, Compass, House, SquaresFour, Stack } from '@phosphor-icons/react'
import type { GatekeeperAppInfo } from '@gadgets/workshop-shared/api'
import { GatekeeperAppIcon } from '../../components/GatekeeperAppIcon'
import type { SidebarStructure } from './sidebarLayout'

export type SidebarItemDef = {
  key: string
  label: string
  to: LinkProps['to']
  params?: LinkProps['params']
  icon: ReactNode
}

export type SidebarNavDefaults = {
  structure: SidebarStructure
  items: Map<string, SidebarItemDef>
  /** Module-declared group titles by container key. */
  groupTitles: Map<string, string>
}

const builtin = (id: string, label: string, to: LinkProps['to'], icon: ReactNode): SidebarItemDef => ({
  key: `builtin:${id}`,
  label,
  to,
  icon,
})

const HOME = builtin('home', 'Home', '/', <House size={14} weight="regular" />)
const WORKSPACES = builtin('workspaces', 'Workspaces', '/workspaces', <SquaresFour size={14} weight="regular" />)
const BLUEPRINTS = builtin('blueprints', 'Blueprints', '/blueprints', <Blueprint size={14} weight="regular" />)
const OUTPUTS = builtin('outputs', 'Outputs', '/outputs', <Stack size={14} weight="regular" />)
const EXPLORE = builtin('explore', 'Explore', '/explore', <Compass size={14} weight="regular" />)

const appItem = (app: GatekeeperAppInfo): SidebarItemDef => ({
  key: `app:${app.id}`,
  label: app.title,
  to: '/gatekeepers/$appId',
  params: { appId: app.id } as LinkProps['params'],
  icon: <GatekeeperAppIcon app={app} />,
})

/** The sidebar as modules declare it: built-ins, ungrouped apps, then one group per `VendorDescription.group`, in the order `apps` arrives (the backend sorts by group, then item order). */
export const buildSidebarDefaults = (apps: GatekeeperAppInfo[]): SidebarNavDefaults => {
  const items = new Map<string, SidebarItemDef>()
  const add = (def: SidebarItemDef): string => {
    items.set(def.key, def)
    return def.key
  }

  const main = [
    add(HOME),
    add(WORKSPACES),
    add(BLUEPRINTS),
    add(OUTPUTS),
    ...apps.filter((app) => !app.group).map((app) => add(appItem(app))),
    add(EXPLORE),
  ]

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
    group.items.push(add(appItem(app)))
  }

  return { structure: { main, groups }, items, groupTitles }
}
