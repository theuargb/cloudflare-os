import { soleGroupKey, type SidebarStructure } from '../sidebar-customization/sidebarLayout'
import type { SidebarItemDef, SidebarNavDefaults } from '../sidebar-customization/sidebarNavDefs'

/** A sidebar row as the top bar shows it, with the user's label. */
export type TopNavRow = { def: SidebarItemDef; label: string }

/** One top bar item: a plain row, or a module group that opens a megamenu of its rows. */
export type TopNavItem =
  | ({ kind: 'row'; key: string } & TopNavRow)
  | { kind: 'group'; key: string; title: string; icon?: { url: string }; rows: TopNavRow[] }

/**
 * The top bar's items in the user's sidebar order and labels (read-only; drag and rename stay in the
 * expanded sidebar): the main rows, then the groups. Empty groups are dropped; the only group with two
 * or more rows (as in the sidebar, `soleGroupKey`) is unwrapped into its rows; a one-row group without
 * pages (a link) is just its row; every other group, a one-module one too, opens a megamenu. Groups
 * carry their icon; rows carry none on the bar.
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
  const groups = resolved.groups.map((group) => ({ key: group.key, rows: rows(group.items) }))
  const sole = soleGroupKey(groups.map((group) => ({ key: group.key, items: group.rows.map((row) => row.key) })))
  const items: TopNavItem[] = rows(resolved.main).map((row) => ({ kind: 'row', ...row }))
  for (const group of groups) {
    if (group.rows.length === 0) continue
    if (group.key === sole || (group.rows.length === 1 && !group.rows[0]!.def.pages)) {
      items.push(...group.rows.map((row) => ({ kind: 'row' as const, ...row })))
      continue
    }
    const title = labels[group.key] ?? defaults.groupTitles.get(group.key) ?? group.key
    const icon = defaults.groupIcons.get(group.key)
    items.push({ kind: 'group', key: group.key, title, ...(icon ? { icon } : {}), rows: group.rows.map(({ def, label }) => ({ def, label })) })
  }
  return items
}
