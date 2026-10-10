import type { ReactNode } from 'react'
import type { AppActionKind } from '@gadgets/workshop-shared/app-host'
import { isCreateQuery, scoreEntry } from './matcher'
import { recencyScore, type RecentEntry } from './recents'

/** One launcher action: a gatekeeper app's registered action or a core one. */
export type SpotlightEntry = {
  /** Stable id; also the key of the user's pick history. */
  id: string
  kind: AppActionKind
  /** Owning management app; absent for core actions. */
  appId?: string
  /** Module title shown under the action ("Trade", "Workspaces"). */
  module: string
  moduleIcon: ReactNode
  /** The section inside the module ("Purchases"). */
  section?: string
  title: string
  keywords?: string[]
  featured?: boolean
  run: () => void
}

export type RankedEntry = SpotlightEntry & { indices: number[] }
export type SpotlightSectionId = 'recent' | 'current' | 'featured' | 'results'
export type SpotlightSection = { id: SpotlightSectionId; heading: string; items: RankedEntry[] }
/** Candidates per kind before the kind filter applies, for the filter chips; `all` is the total. */
export type KindCounts = Record<AppActionKind | 'all', number>

export type Ranking = { sections: SpotlightSection[]; counts: KindCounts }

const RECENT_LIMIT = 6
const FEATURED_LIMIT = 10
const RESULTS_LIMIT = 40
const CREATE_BOOST = 15
const FEATURED_BOOST = 3

function countKinds(entries: SpotlightEntry[]): KindCounts {
  const counts: KindCounts = { all: entries.length, create: 0, list: 0, report: 0, operation: 0, settings: 0 }
  for (const entry of entries) counts[entry.kind] += 1
  return counts
}

const unranked = (entry: SpotlightEntry): RankedEntry => ({ ...entry, indices: [] })

/** Featured actions interleaved across modules (first of each, then second of each…), so no module crowds the rest out. */
export function featuredEntries(entries: SpotlightEntry[]): SpotlightEntry[] {
  const byModule: Record<string, SpotlightEntry[]> = {}
  for (const entry of entries) if (entry.featured) (byModule[entry.appId ?? ''] ??= []).push(entry)
  const queues = Object.values(byModule)
  const result: SpotlightEntry[] = []
  for (let round = 0; queues.some((queue) => queue.length > round); round++) {
    for (const queue of queues) if (queue[round]) result.push(queue[round])
  }
  return result
}

/**
 * Empty query: recent picks, then every action of the app on screen ("In this module") or, outside
 * an app, the featured actions of all apps; with a kind picked, every action of that kind. Otherwise one list ranked by match score, create intent,
 * `featured` and the user's pick history. `kind` narrows both modes; counts ignore it.
 */
export function rankEntries(
  entries: SpotlightEntry[],
  query: string,
  kind: AppActionKind | null,
  recents: RecentEntry[],
  currentAppId: string | null,
): Ranking {
  const needle = query.trim()
  const ofKind = (entry: SpotlightEntry) => !kind || entry.kind === kind

  if (!needle) {
    const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry]))
    const recent = recents.flatMap((pick) => byId[pick.id] && ofKind(byId[pick.id]) ? [byId[pick.id]] : []).slice(0, RECENT_LIMIT)
    const shown = Object.fromEntries(recent.map((entry) => [entry.id, true]))
    const current = currentAppId ? entries.filter((entry) => entry.appId === currentAppId) : []
    const scope = current.length ? current : entries
    const sections: SpotlightSection[] = [{ id: 'recent', heading: 'Recent', items: recent.map(unranked) }]
    if (kind) {
      // A kind picked without a query browses every action of that kind.
      sections.push({ id: 'results', heading: 'Actions', items: scope.filter((entry) => ofKind(entry) && !shown[entry.id]).map(unranked) })
    } else if (current.length) {
      sections.push({ id: 'current', heading: 'In this module', items: current.filter((entry) => ofKind(entry) && !shown[entry.id]).map(unranked) })
    } else {
      const featured = featuredEntries(entries).filter((entry) => !shown[entry.id]).slice(0, FEATURED_LIMIT)
      sections.push({ id: 'featured', heading: 'Featured', items: featured.map(unranked) })
    }
    return { sections: sections.filter((section) => section.items.length > 0), counts: countKinds(scope) }
  }

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
  matched.sort((a, b) => b.score - a.score)
  const items = matched.filter(({ entry }) => ofKind(entry)).slice(0, RESULTS_LIMIT).map(({ entry }) => entry)
  return {
    sections: items.length ? [{ id: 'results', heading: 'Actions', items }] : [],
    counts: countKinds(matched.map(({ entry }) => entry)),
  }
}
