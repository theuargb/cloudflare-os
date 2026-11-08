import type { ReactNode } from 'react'
import type { LinkProps } from '@tanstack/react-router'
import { GlobeSimple, House } from '@phosphor-icons/react'
import type { GatekeeperAppInfo, GatekeeperAppNavigation } from '@gadgets/workshop-shared/api'
import type { AppEntry, AppExternalLink, AppNavSection } from '@gadgets/workshop-shared/app-host'
import { GatekeeperAppIcon } from '../../components/GatekeeperAppIcon'
import type { SidebarStructure } from './sidebarLayout'

export type SidebarItemDef = {
  key: string
  label: string
  /** Route of an in-app row; absent on external link rows (`href`). */
  to?: LinkProps['to'];
  /** External page opened in a new tab; the row is a plain anchor, never active. */
  href?: string;
  params?: LinkProps['params']
  /** Search params of the link: an app entry row opens the app at the entry's route (`at`). */
  search?: { at: string }
  /** Set on the rows of an app that publishes several entries; drives the active highlight. */
  entry?: { id: string; first: boolean }
  /** Set on rows that open a gatekeeper app: the open app's section tree nests under the active one. */
  appId?: string
  /** The row's pages (`AppEntry.sections`): the row expands to them instead of opening the app. */
  pages?: AppNavSection[]
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

const appLink = (app: GatekeeperAppInfo) => ({
  to: '/gatekeepers/$appId' as LinkProps['to'],
  params: { appId: app.id } as LinkProps['params'],
  appId: app.id,
})

/** A row that opens an external page in a new tab. */
const externalItem = (app: GatekeeperAppInfo, link: AppExternalLink): SidebarItemDef => ({
  key: `link:${app.id}:${link.id}`,
  label: link.title,
  href: link.href,
  icon: <GlobeSimple size={14} weight="regular" />,
});

/** A row that opens the app at an entry's route; `first` marks the row highlighted while the open route names no entry. */
const entryItem = (app: GatekeeperAppInfo, entry: AppEntry, first: boolean): SidebarItemDef => ({
  ...appLink(app),
  key: `app:${app.id}:${entry.id}`,
  label: entry.title,
  search: { at: entry.route },
  entry: { id: entry.id, first },
  icon: <GatekeeperAppIcon app={{ ...app, icon: entry.icon ?? app.icon }} />,
  ...(entry.sections ? { pages: entry.sections } : {}),
})

/** One row for a single-area app, one row per entry for an app that publishes `entries`. */
const appItems = (app: GatekeeperAppInfo): SidebarItemDef[] => {
  if (!app.entries) return [{ ...appLink(app), key: `app:${app.id}`, label: app.title, icon: <GatekeeperAppIcon app={app} /> }]
  return app.entries.map((entry, index) => entryItem(app, entry, index === 0))
}

type Container = { key: string; title: string; order: number | undefined; sidebarItems: string[]; appItems: string[] }

/**
 * The sidebar as modules declare it: Home, ungrouped apps, then the groups. An app that publishes a
 * sidebar tree (`AppNavigation.sidebar`) contributes its tree instead of its own rows; groups of the
 * same title merge (tree items first, then app rows). Groups sort by their order (VendorGroup.order),
 * undeclared last; ties keep the order `apps` arrives in (the backend sorts by group, then item order).
 */
export const buildSidebarDefaults = (apps: GatekeeperAppInfo[], navigation: GatekeeperAppNavigation[]): SidebarNavDefaults => {
  const items = new Map<string, SidebarItemDef>()
  const add = (def: SidebarItemDef): string => {
    items.set(def.key, def)
    return def.key
  }
  const trees = new Map(navigation.flatMap(({ appId, sidebar }) => (sidebar ? [[appId, sidebar] as const] : [])))

  const main = [add(HOME)]
  const containers: Container[] = []
  const container = (title: string, order: number | undefined): Container => {
    const key = `group:${title}`
    let found = containers.find((candidate) => candidate.key === key)
    if (!found) {
      found = { key, title, order, sidebarItems: [], appItems: [] }
      containers.push(found)
    } else if (order !== undefined && (found.order === undefined || order < found.order)) {
      found.order = order
    }
    return found
  }

  for (const app of apps) {
    const tree = trees.get(app.id)
    if (tree) {
      let first = true
      for (const group of tree) {
        const target = container(group.title, group.order)
        for (const entry of group.items) {
          target.sidebarItems.push(add(entryItem(app, entry, first)))
          first = false
        }
        for (const link of group.links ?? []) target.sidebarItems.push(add(externalItem(app, link)));
      }
    } else if (app.group) {
      container(app.group.title, app.group.order).appItems.push(...appItems(app).map(add))
    } else {
      main.push(...appItems(app).map(add))
    }
  }

  const sorted = containers.toSorted((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
  return {
    structure: { main, groups: sorted.map(({ key, sidebarItems, appItems }) => ({ key, items: [...sidebarItems, ...appItems] })) },
    items,
    groupTitles: new Map(sorted.map(({ key, title }) => [key, title])),
  }
}
