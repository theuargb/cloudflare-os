import type { ReactNode } from 'react'
import type { AppActionKind, AppMenuKind } from '@gadgets/workshop-shared/app-host'
import { countTypes, inType, moduleSections, type SpotlightSection, type SpotlightType, type TypeCounts } from './catalog'
import { isCreateQuery, scoreEntry } from './matcher'
import { recencyScore, type RecentEntry } from './recents'

/** One launcher action: a gatekeeper app's registered action or a core one. */
export type SpotlightEntry = {
  /** Stable id; also the key of the user's pick history. */
  id: string
  kind: AppActionKind
  /** Grouping key of the owning module (the composed module's id, else the management app's); absent for core actions. */
  moduleKey?: string
  /** Module title ("Trade", "Workspaces"): the block heading when browsing, and match context. */
  module: string
  moduleIcon: ReactNode
  /** The section inside the module ("Purchases"). */
  section?: string
  /** Menu type the action is grouped under. */
  menu?: AppMenuKind
  /** Sub-heading inside the module block. */
  group?: string
  title: string
  keywords?: string[]
  featured?: boolean
  run: () => void
  /** Warms what `run` opens (an app action's route) while the user points at or highlights the entry. */
  preload?: () => void
}

/** An entry with the title indices the query matched (empty when unranked). */
export type RankedEntry = SpotlightEntry & { indices: number[] }

/** The launcher list: sections to render and per-type counts for the picker. */
export type Ranking = { sections: SpotlightSection[]; counts: TypeCounts }

/** Most recent picks a launcher list shows (Spotlight, topbar type menus). */
export const RECENT_LIMIT = 6
const RESULTS_LIMIT = 40
const CREATE_BOOST = 15
const FEATURED_BOOST = 3

/** Featured actions interleaved across modules (first of each, then second of each…), so no module crowds the rest out. */
export function featuredEntries(entries: SpotlightEntry[]): SpotlightEntry[] {
  const byModule: Record<string, SpotlightEntry[]> = {}
  for (const entry of entries) if (entry.featured) (byModule[entry.moduleKey ?? ''] ??= []).push(entry)
  const queues = Object.values(byModule)
  const result: SpotlightEntry[] = []
  for (let round = 0; queues.some((queue) => queue.length > round); round++) {
    for (const queue of queues) if (queue[round]) result.push(queue[round])
  }
  return result
}

/** Entries matching `needle`, best first: match score, the user's pick history, create intent and `featured`. */
export function rankMatches(entries: SpotlightEntry[], needle: string, recents: RecentEntry[]): RankedEntry[] {
  const createIntent = isCreateQuery(needle)
  const matched: { entry: RankedEntry; score: number }[] = []
  for (const entry of entries) {
    const context = entry.section ? `${entry.module} ${entry.section}` : entry.module
    const match = scoreEntry(entry.title, entry.keywords, context, needle)
    if (!match) continue
    const score = match.score
      + recencyScore(entry.id, recents)
      + (createIntent && entry.kind === 'create' ? CREATE_BOOST : 0)
      + (entry.featured ? FEATURED_BOOST : 0)
    matched.push({ entry: { ...entry, indices: match.indices }, score })
  }
  return matched.toSorted((a, b) => b.score - a.score).map(({ entry }) => entry)
}

/**
 * Empty query: recent picks, then every action of `type` grouped by module (sidebar order) and
 * sub-heading; recent picks stay in their module block too. Otherwise one list ranked by
 * `rankMatches`. `type` narrows both modes; counts ignore it (the whole catalog, or every match).
 */
export function rankEntries(entries: SpotlightEntry[], query: string, type: SpotlightType, recents: RecentEntry[]): Ranking {
  const needle = query.trim()

  if (!needle) {
    const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry]))
    const recent = recents
      .flatMap((pick) => byId[pick.id] && inType(byId[pick.id], type) ? [{ ...byId[pick.id], indices: [] }] : [])
      .slice(0, RECENT_LIMIT)
    const sections: SpotlightSection[] = [
      { id: 'recent', heading: 'Recent', groups: [{ title: '', items: recent }] },
      ...moduleSections(entries.filter((entry) => inType(entry, type))),
    ]
    return {
      sections: sections.filter((section) => section.groups.some((group) => group.items.length > 0)),
      counts: countTypes(entries),
    }
  }

  const matched = rankMatches(entries, needle, recents)
  const items = matched.filter((entry) => inType(entry, type)).slice(0, RESULTS_LIMIT)
  return {
    sections: items.length ? [{ id: 'results', heading: 'Actions', groups: [{ title: '', items }] }] : [],
    counts: countTypes(matched),
  }
}
