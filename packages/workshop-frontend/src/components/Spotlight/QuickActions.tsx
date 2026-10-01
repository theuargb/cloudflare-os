import { useMemo, useState } from 'react'
import { ArrowRightIcon } from '@phosphor-icons/react'
import { KindTile } from './kinds'
import { featuredEntries, rankEntries, type RankedEntry, type SpotlightEntry } from './ranking'
import { highlightIndices } from './matcher'
import { getRecents, recordPick } from './recents'
import { openCommandPalette } from '../AppShell/commandPaletteBus'
import { useSpotlightEntries } from './useSpotlightEntries'

const LIMIT = 8

/**
 * Home quick actions: the user's recent picks, then featured actions of their modules, as cards.
 * While the user types in the home composer (`query`), the cards become the best-matching actions
 * of the whole catalog, ranked like the Spotlight search (which stays one click / ⌘K away).
 */
export default function QuickActions({ query = '' }: { query?: string }) {
  const entries = useSpotlightEntries()
  const [recents, setRecents] = useState(getRecents)
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'
  const needle = query.trim()

  const items = useMemo((): Array<SpotlightEntry | RankedEntry> => {
    if (needle) return rankEntries(entries, needle, null, recents, null).sections[0]?.items.slice(0, LIMIT) ?? []
    const byId = Object.fromEntries(entries.map((entry) => [entry.id, entry]))
    const recent = recents.flatMap((pick) => byId[pick.id] ? [byId[pick.id]] : [])
    const shown = Object.fromEntries(recent.map((entry) => [entry.id, true]))
    return [...recent, ...featuredEntries(entries).filter((entry) => !shown[entry.id])].slice(0, LIMIT)
  }, [entries, recents, needle])

  const run = (entry: SpotlightEntry) => {
    setRecents(recordPick(entry.id))
    entry.run()
  }

  return (
    <section aria-label="Quick actions" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.4px] text-kumo-inactive">{needle ? 'Matching actions' : 'Quick actions'}</h2>
        <button
          type="button"
          onClick={openCommandPalette}
          className="press flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[12.5px] text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default"
        >
          All actions
          <kbd className="rounded border border-kumo-line px-1 py-0.5 font-sans text-[10px] leading-none text-kumo-inactive">{shortcut}</kbd>
        </button>
      </div>
      {needle && items.length === 0 ? (
        <p className="px-1 text-[12.5px] text-kumo-inactive">No action matches — send it to the assistant.</p>
      ) : (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => run(entry)}
            className="group press flex cursor-pointer items-center gap-3 rounded-xl border border-kumo-line bg-kumo-base px-3 py-2.5 text-left transition-colors hover:border-kumo-interact hover:bg-kumo-elevated"
          >
            <KindTile kind={entry.kind} size={32} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13.5px] leading-5 tracking-[-0.2px] text-kumo-default">
                {'indices' in entry
                  ? highlightIndices(entry.title, entry.indices, (key, text, bold) =>
                      bold ? <strong key={key} className="font-semibold text-kumo-strong">{text}</strong> : <span key={key}>{text}</span>)
                  : entry.title}
              </span>
              <span className="truncate text-[11.5px] leading-4 text-kumo-inactive">{entry.section ? `${entry.module} · ${entry.section}` : entry.module}</span>
            </span>
            <ArrowRightIcon size={14} className="shrink-0 text-kumo-inactive opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
      )}
    </section>
  )
}
