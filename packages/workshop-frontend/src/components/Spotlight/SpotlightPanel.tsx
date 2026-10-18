import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ChatCircleDotsIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { GatekeeperAppIcon } from '../GatekeeperAppIcon'
import { isImeComposing } from '../../keyboardEvent'
import { ActionRow, AssistantRow, RecordRow } from './ActionRow'
import { countTypes, SPOTLIGHT_TYPES, type SpotlightType } from './catalog'
import { rankEntries, type RankedEntry } from './ranking'
import { getRecents, recordPick } from './recents'
import { useRecordSearch } from './useRecordSearch'
import { TypeTabs } from './TypeTabs'
import { useSpotlightEntries } from './useSpotlightEntries'

function Key({ children }: { children: string }) {
  return <kbd className="rounded border border-kumo-line px-1 py-0.5 font-sans leading-none">{children}</kbd>
}

/**
 * The launcher body: query field, type picker (rail ≥ sm, chips below), sections of action rows and
 * the assistant fallback. Keys: ↑↓ move, Enter runs, Tab/Shift+Tab cycle the types, Esc closes.
 */
export default function SpotlightPanel({ onDone }: { onDone: () => void }) {
  const entries = useSpotlightEntries()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<SpotlightType>('all')
  const [activeIndex, setActiveIndex] = useState(0)
  const [recents, setRecents] = useState(getRecents)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])

  // Types absent from the whole catalog are hidden; the list stays put while typing.
  const totals = useMemo(() => countTypes(entries), [entries])
  const types = useMemo(() => SPOTLIGHT_TYPES.filter(({ type }) => type === 'all' || totals[type] > 0), [totals])
  const type = types.some((t) => t.type === picked) ? picked : 'all'
  const { sections, counts } = useMemo(() => rankEntries(entries, query, type, recents), [entries, query, type, recents])
  const needle = query.trim()
  const records = useRecordSearch(query)
  const recordHits = useMemo(() => records.flatMap((group) => group.hits.map((hit) => ({ appId: group.app.id, hit }))), [records])
  const flat = useMemo(() => sections.flatMap((section) => section.groups.flatMap((group) => group.items)), [sections])
  // Records follow the actions, the assistant row follows everything whenever there is a query.
  const total = flat.length + recordHits.length + (needle ? 1 : 0)

  useEffect(() => { setActiveIndex(0) }, [query, type])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const pick = useCallback((entry: RankedEntry) => {
    setRecents(recordPick(entry.id))
    onDone()
    entry.run()
  }, [onDone])

  const askAssistant = useCallback(() => {
    onDone()
    navigate({ to: '/', search: { prompt: needle } })
  }, [onDone, navigate, needle])

  const openRecord = useCallback((appId: string, route: string) => {
    onDone()
    navigate({ to: '/gatekeepers/$appId', params: { appId }, search: { at: route } })
  }, [onDone, navigate])

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (isImeComposing(event)) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (total) setActiveIndex((i) => (i + (event.key === 'ArrowDown' ? 1 : total - 1)) % total)
    } else if (event.key === 'Tab') {
      event.preventDefault()
      const at = types.findIndex((t) => t.type === type)
      setPicked(types[(at + (event.shiftKey ? types.length - 1 : 1)) % types.length].type)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (activeIndex < flat.length) pick(flat[activeIndex])
      else if (activeIndex < flat.length + recordHits.length) {
        const { appId, hit } = recordHits[activeIndex - flat.length]
        openRecord(appId, hit.route)
      } else if (needle) askAssistant()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onDone()
    }
  }, [total, types, type, activeIndex, flat, recordHits, needle, pick, openRecord, askAssistant, onDone])

  const selectType = (next: SpotlightType) => {
    setPicked(next)
    inputRef.current?.focus()
  }
  const tabs = { types, selected: type, counts, onSelect: selectType }

  let offset = 0
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 pl-4 pr-2 sm:border-b sm:border-kumo-line sm:pr-4">
        <MagnifyingGlassIcon size={18} className="shrink-0 text-kumo-inactive" />
        {/* 16px below `sm`: iOS Safari zooms the page into any focused field under 16px. */}
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="What do you need to do? Create a sale, close the month…"
          aria-label="Search actions"
          className="h-14 w-full min-w-0 bg-transparent text-[16px] leading-5 tracking-[-0.25px] text-kumo-default placeholder:text-kumo-inactive focus:outline-none sm:text-[15px]"
        />
        <kbd className="hidden shrink-0 rounded border border-kumo-line px-1.5 py-0.5 font-sans text-[10px] leading-none text-kumo-inactive sm:block">ESC</kbd>
        <button
          type="button"
          onClick={onDone}
          aria-label="Close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-kumo-subtle transition-colors hover:bg-kumo-tint hover:text-kumo-default sm:hidden"
        >
          <XIcon size={18} />
        </button>
      </div>

      <TypeTabs variant="chips" {...tabs} />

      <div className="flex min-h-0 flex-1">
        <TypeTabs variant="rail" {...tabs} />
        <div ref={listRef} className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {sections.map((section) => (
            <div key={section.id} className="mb-2 last:mb-0">
              <p className="flex items-center gap-1.5 px-3 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-[0.4px] text-kumo-inactive">
                {section.icon && <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{section.icon}</span>}
                {section.heading}
              </p>
              {section.groups.map((group) => {
                const start = offset
                offset += group.items.length
                return (
                  <div key={group.title}>
                    {section.groups.length > 1 && group.title && (
                      <p className="px-3 pb-0.5 pt-1.5 text-[11px] text-kumo-subtle">{group.title}</p>
                    )}
                    {group.items.map((entry, i) => (
                      <ActionRow
                        key={`${section.id}:${entry.id}`}
                        entry={entry}
                        index={start + i}
                        active={start + i === activeIndex}
                        onHover={setActiveIndex}
                        onPick={pick}
                      />
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
          {flat.length === 0 && recordHits.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-kumo-inactive">
              {needle ? 'Nothing found.' : 'Module actions appear here once modules register them.'}
            </p>
          )}
          {records.map((group) => {
            const start = flat.length + recordHits.findIndex((item) => item.appId === group.app.id)
            return (
              <div key={`records:${group.app.id}`} className="mb-2">
                <p className="px-3 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-[0.4px] text-kumo-inactive">{group.app.title}</p>
                {group.hits.map((hit, i) => (
                  <RecordRow
                    key={hit.id}
                    hit={hit}
                    icon={<GatekeeperAppIcon app={group.app} />}
                    index={start + i}
                    active={start + i === activeIndex}
                    onHover={setActiveIndex}
                    onPick={() => openRecord(group.app.id, hit.route)}
                  />
                ))}
              </div>
            )
          })}
          {needle && (
            <AssistantRow
              query={needle}
              icon={<ChatCircleDotsIcon size={16} weight="bold" />}
              index={flat.length + recordHits.length}
              active={activeIndex === flat.length + recordHits.length}
              onHover={setActiveIndex}
              onPick={askAssistant}
            />
          )}
        </div>
      </div>

      <div className="hidden items-center gap-4 border-t border-kumo-line px-4 py-2.5 text-[11px] text-kumo-inactive sm:flex">
        <span className="flex items-center gap-1"><Key>↑</Key><Key>↓</Key> navigate</span>
        <span className="flex items-center gap-1"><Key>Tab</Key> action type</span>
        <span className="flex items-center gap-1"><Key>↵</Key> run</span>
        <span className="flex items-center gap-1"><Key>esc</Key> close</span>
      </div>
    </div>
  )
}
