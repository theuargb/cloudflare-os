import type { SidebarStructure } from '../sidebar-customization/sidebarLayout'
import type { SidebarItemDef, SidebarNavDefaults } from '../sidebar-customization/sidebarNavDefs'

/** A sidebar row as the top bar shows it, with the user's label. */
export type TopNavRow = { def: SidebarItemDef; label: string }

/** One top bar item: a plain row, or a module group that opens a megamenu of its rows. */
export type TopNavItem =
  | ({ kind: 'row'; key: string } & TopNavRow)
  | { kind: 'group'; key: string; title: string; rows: TopNavRow[] }

/**
 * The top bar's items in the user's sidebar order and labels (read-only; drag and rename stay in the
 * expanded sidebar): the main rows, then the groups. Empty groups are dropped and a one-row group is
 * just its row, as in the sidebar.
 */
export function topNavItems(
  defaults: SidebarNavDefaults,
  resolved: SidebarStructure,
  labels: Record<string, string>,
): TopNavItem[] {
  const rows = (keys: string[]): ({ key: string } & TopNavRow)[] =>
    keys.flatMap((key) => {
      const def = defaults.items.get(key)
      return def ? [{ key, def, label: labels[key] ?? def.label }] : []
    })
  const items: TopNavItem[] = rows(resolved.main).map((row) => ({ kind: 'row', ...row }))
  for (const group of resolved.groups) {
    const groupRows = rows(group.items)
    if (groupRows.length === 0) continue
    if (groupRows.length === 1) {
      items.push({ kind: 'row', ...groupRows[0]! })
      continue
    }
    const title = labels[group.key] ?? defaults.groupTitles.get(group.key) ?? group.key
    items.push({ kind: 'group', key: group.key, title, rows: groupRows.map(({ def, label }) => ({ def, label })) })
  }
  return items
}
