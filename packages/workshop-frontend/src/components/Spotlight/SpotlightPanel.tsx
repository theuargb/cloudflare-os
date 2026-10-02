import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { ChatCircleDotsIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import type { AppActionKind } from '@gadgets/workshop-shared/app-host'
import { GatekeeperAppIcon } from '../GatekeeperAppIcon'
import { isImeComposing } from '../../keyboardEvent'
import { ActionRow, AssistantRow, RecordRow } from './ActionRow'
import { ACTION_KINDS, KIND_ORDER } from './kinds'
import { rankEntries, type RankedEntry } from './ranking'
import { getRecents, recordPick } from './recents'
import { useRecordSearch } from './useRecordSearch'
import { useSpotlightEntries } from './useSpotlightEntries'

const APP_PATH = /^\/gatekeepers\/([^/]+)\/?$/
const FILTERS: (AppActionKind | null)[] = [null, ...KIND_ORDER]

function Key({ children }: { children: string }) {
  return <kbd className="rounded border border-kumo-line px-1 py-0.5 font-sans leading-none">{children}</kbd>
}

/**
 * The ⌘K modal body: query field, kind filter, sections of action rows and the assistant fallback.
 * Keys: ↑↓ move, Enter runs, Tab/Shift+Tab cycle the kind filter, Esc closes.
 */
export default function SpotlightPanel({ onDone }: { onDone: () => void }) {
  const entries = useSpotlightEntries()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<AppActionKind | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [recents, setRecents] = useState(getRecents)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const currentAppId = APP_PATH.exec(pathname)?.[1] ?? null
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])

  const { sections, counts } = useMemo(
    () => rankEntries(entries, query, kind, recents, currentAppId),
    [entries, query, kind, recents, currentAppId],
  )
  const needle = query.trim()
  const records = useRecordSearch(query)
  const recordHits = useMemo(() => records.flatMap((group) => group.hits.map((hit) => ({ appId: group.app.id, hit }))), [records])
  const flat = useMemo(() => sections.flatMap((section) => section.items), [sections])
  // Records follow the actions, the assistant row follows everything whenever there is a query.
  const total = flat.length + recordHits.length + (needle ? 1 : 0)

  useEffect(() => { setActiveIndex(0) }, [query, kind])
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
      const at = FILTERS.indexOf(kind)
      setKind(FILTERS[(at + (event.shiftKey ? FILTERS.length - 1 : 1)) % FILTERS.length])
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
  }, [total, kind, activeIndex, flat, recordHits, needle, pick, openRecord, askAssistant, onDone])

  let offset = 0
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 px-4">
        <MagnifyingGlassIcon size={18} className="shrink-0 text-kumo-inactive" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Що потрібно зробити? Створити реалізацію, закрити місяць…"
          aria-label="Пошук дій"
          className="h-14 w-full bg-transparent text-[15px] leading-5 tracking-[-0.25px] text-kumo-default placeholder:text-kumo-inactive focus:outline-none"
        />
        <kbd className="hidden shrink-0 rounded border border-kumo-line px-1.5 py-0.5 font-sans text-[10px] leading-none text-kumo-inactive sm:block">ESC</kbd>
      </div>

      <div role="tablist" aria-label="Тип дії" className="flex gap-1.5 overflow-x-auto border-b border-kumo-line px-4 pb-3">
        {FILTERS.map((filter) => {
          const selected = filter === kind
          const count = counts[filter ?? 'all']
          return (
            <button
              key={filter ?? 'all'}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => { setKind(filter); inputRef.current?.focus() }}
              className={[
                'flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors',
                selected ? 'border-kumo-brand bg-kumo-brand/10 font-medium text-kumo-brand' : 'border-kumo-line text-kumo-subtle hover:bg-kumo-tint',
                count === 0 && !selected ? 'opacity-50' : '',
              ].join(' ')}
            >
              {filter && <span aria-hidden className={`h-2 w-2 rounded-full ${ACTION_KINDS[filter].dot}`} />}
              {filter ? ACTION_KINDS[filter].filter : 'Усі'}
              <span className={selected ? 'opacity-70' : 'text-kumo-inactive'}>{count}</span>
            </button>
          )
        })}
      </div>

      <div ref={listRef} className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {sections.map((section) => {
          const start = offset
          offset += section.items.length
          return (
            <div key={section.id} className="mb-2 last:mb-0">
              <p className="px-3 pt-1 pb-1.5 text-[11px] font-medium uppercase tracking-[0.4px] text-kumo-inactive">{section.heading}</p>
              {section.items.map((entry, i) => (
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
        {flat.length === 0 && recordHits.length === 0 && (
          <p className="px-3 py-6 text-center text-[13px] text-kumo-inactive">
            {needle ? 'Нічого не знайдено.' : 'Дії модулів з’являться тут, щойно модулі їх зареєструють.'}
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

      <div className="hidden items-center gap-4 border-t border-kumo-line px-4 py-2.5 text-[11px] text-kumo-inactive sm:flex">
        <span className="flex items-center gap-1"><Key>↑</Key><Key>↓</Key> переміщення</span>
        <span className="flex items-center gap-1"><Key>Tab</Key> тип дії</span>
        <span className="flex items-center gap-1"><Key>↵</Key> виконати</span>
        <span className="flex items-center gap-1"><Key>esc</Key> закрити</span>
      </div>
    </div>
  )
}
