import type { GatekeeperAppInfo, GatekeeperAppNavigation } from '@gadgets/workshop-shared/api'
import type { AppAction, AppActionKind, AppMenuKind } from '@gadgets/workshop-shared/app-host'

/** Menu rail kinds in display order (`overview` is the sidebar's job, settings are ⌘K-only). */
export const NAV_KINDS: { kind: AppMenuKind; label: string }[] = [
  { kind: 'documents', label: 'Documents' },
  { kind: 'registers', label: 'Registers' },
  { kind: 'journals', label: 'Journals' },
  { kind: 'reports', label: 'Reports' },
  { kind: 'references', label: 'References' },
  { kind: 'classifiers', label: 'Classifiers' },
]

/** Row order inside a group: browse first, then create, then processes. */
const ROW_ORDER: AppActionKind[] = ['list', 'create', 'operation', 'report', 'settings']

/** The actions of one module that share a sub-heading (the sidebar entry, else the section). */
export type NavGroup = { title: string; actions: AppAction[] }

/** One module's block inside a menu. */
export type NavModule = { app: GatekeeperAppInfo; groups: NavGroup[] }

export type NavMenu = { kind: AppMenuKind; label: string; modules: NavModule[]; size: number }

/**
 * The menus that have at least one action: modules in `apps` (sidebar) order — apps the user can
 * no longer open are skipped — groups in first-appearance (manifest) order, rows journals first.
 */
export function buildTopNav(apps: GatekeeperAppInfo[], navigation: GatekeeperAppNavigation[]): NavMenu[] {
  const actionsByApp = new Map(navigation.map(({ appId, actions }) => [appId, actions]))
  return NAV_KINDS.flatMap(({ kind, label }) => {
    const modules = apps.flatMap((app) => {
      const groups = groupActions((actionsByApp.get(app.id) ?? []).filter((action) => action.menu === kind))
      return groups.length > 0 ? [{ app, groups }] : []
    })
    const size = modules.reduce((total, module) => total + module.groups.reduce((sum, group) => sum + group.actions.length, 0), 0)
    return size > 0 ? [{ kind, label, modules, size }] : []
  })
}

function groupActions(actions: AppAction[]): NavGroup[] {
  const groups = new Map<string, AppAction[]>()
  for (const action of actions) {
    const title = action.group ?? ''
    groups.set(title, [...(groups.get(title) ?? []), action])
  }
  return [...groups].map(([title, rows]) => ({
    title,
    // Array.sort is stable: manifest order is kept inside a kind.
    actions: rows.toSorted((a, b) => ROW_ORDER.indexOf(a.kind) - ROW_ORDER.indexOf(b.kind)),
  }))
}

const APP_PATH = /^\/gatekeepers\/([^/]+)\/?$/

/** The open app screen: the app from the path and the app route from `at`. Null outside an app or on its landing screen. */
export function currentScreen(pathname: string, at: string | undefined): { appId: string; route: string } | null {
  const appId = APP_PATH.exec(pathname)?.[1]
  return appId && at ? { appId, route: at } : null
}

function parseRoute(route: string): { section: string; params: URLSearchParams } {
  const [path = '', query = ''] = route.split('?', 2)
  let section = path.split('/', 1)[0] ?? ''
  try { section = decodeURIComponent(section) } catch { /* keep the raw segment */ }
  return { section, params: new URLSearchParams(query) }
}

/**
 * Whether the open screen is what `action` opens: same section, same entry, and every param the
 * action sets is on the screen. Sticky params the app adds (`org`) do not matter.
 */
export function opensScreen(action: AppAction, screenRoute: string): boolean {
  const target = parseRoute(action.route)
  const screen = parseRoute(screenRoute)
  if (target.section !== screen.section) return false
  return [...target.params].every(([key, value]) => screen.params.get(key) === value)
}
