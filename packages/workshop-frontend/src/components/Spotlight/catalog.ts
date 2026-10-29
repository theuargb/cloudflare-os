import type { ReactNode } from 'react'
import type { AppActionKind, AppMenuKind } from '@gadgets/workshop-shared/app-host'
import type { RankedEntry, SpotlightEntry } from './ranking'

/** A type group of the launcher: All, a menu kind, Settings, or Other. */
export type SpotlightType = 'all' | AppMenuKind | 'settings' | 'other'

/** The type picker in display order. */
export const SPOTLIGHT_TYPES: { type: SpotlightType; label: string }[] = [
  { type: 'all', label: 'All' },
  { type: 'documents', label: 'Documents' },
  { type: 'registers', label: 'Registers' },
  { type: 'journals', label: 'Journals' },
  { type: 'reports', label: 'Reports' },
  { type: 'references', label: 'References' },
  { type: 'classifiers', label: 'Classifiers' },
  { type: 'settings', label: 'Settings' },
  { type: 'other', label: 'Other' },
]

/** Row order inside a group: browse first, then create, then processes. */
const ROW_ORDER: AppActionKind[] = ['list', 'create', 'operation', 'report', 'settings']

/** entry.menu, else 'settings' for kind 'settings', else 'other' (overview dashboards, core Workspaces actions). */
export function typeOf(entry: Pick<SpotlightEntry, 'menu' | 'kind'>): Exclude<SpotlightType, 'all'> {
  if (entry.menu) return entry.menu
  return entry.kind === 'settings' ? 'settings' : 'other'
}

/** Whether the entry is shown under `type`; every entry is under `all`. */
export function inType(entry: SpotlightEntry, type: SpotlightType): boolean {
  return type === 'all' || typeOf(entry) === type
}

/** Entries per type, for the picker; `all` is the total. */
export type TypeCounts = Record<SpotlightType, number>

/** Counts `entries` per type. */
export function countTypes(entries: SpotlightEntry[]): TypeCounts {
  const counts: TypeCounts = {
    all: entries.length,
    documents: 0,
    registers: 0,
    journals: 0,
    reports: 0,
    references: 0,
    classifiers: 0,
    settings: 0,
    other: 0,
  }
  for (const entry of entries) counts[typeOf(entry)] += 1
  return counts
}

/** Rows under one sub-heading of a section; an empty title has no sub-heading. */
export type SpotlightGroup = { title: string; items: RankedEntry[] }

/** One block of the result list: Recent, a module, or the ranked results. */
export type SpotlightSection = { id: string; heading: string; icon?: ReactNode; groups: SpotlightGroup[] }

/** One section per module, in entry order (= sidebar order). Rows are split by `group` in first-appearance order, then sorted by ROW_ORDER (stable). */
export function moduleSections(entries: SpotlightEntry[]): SpotlightSection[] {
  const modules = new Map<string, { entry: SpotlightEntry; groups: Map<string, RankedEntry[]> }>()
  for (const entry of entries) {
    const key = entry.appId ?? 'core'
    const module = modules.get(key) ?? { entry, groups: new Map<string, RankedEntry[]>() }
    modules.set(key, module)
    const title = entry.group ?? ''
    module.groups.set(title, [...(module.groups.get(title) ?? []), { ...entry, indices: [] }])
  }
  return [...modules].map(([key, { entry, groups }]) => ({
    id: `module:${key}`,
    heading: entry.module,
    icon: entry.moduleIcon,
    groups: [...groups].map(([title, items]) => ({
      title,
      items: items.toSorted((a, b) => ROW_ORDER.indexOf(a.kind) - ROW_ORDER.indexOf(b.kind)),
    })),
  }))
}
