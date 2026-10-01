import type { ReactNode } from 'react'
import { KindPill, KindTile } from './kinds'
import { highlightIndices } from './matcher'
import type { RankedEntry } from './ranking'

type RowProps = {
  index: number
  active: boolean
  onHover: (index: number) => void
  onPick: () => void
  children: ReactNode
}

// Shared row frame. The active row is a light brand tint with a brand edge — the intent colour —
// instead of a grey block; paddings line up with the section headings (px-3).
function Row({ index, active, onHover, onPick, children }: RowProps) {
  return (
    <button
      type="button"
      data-index={index}
      onMouseMove={() => onHover(index)}
      onClick={onPick}
      className={[
        'relative flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
        active ? 'bg-kumo-brand/[0.07] before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-kumo-brand' : 'hover:bg-kumo-tint',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function ActionRow({ entry, ...row }: Omit<RowProps, 'children' | 'onPick'> & { entry: RankedEntry; onPick: (entry: RankedEntry) => void }) {
  return (
    <Row {...row} onPick={() => row.onPick(entry)}>
      <KindTile kind={entry.kind} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13.5px] leading-5 tracking-[-0.2px] text-kumo-default">
          {highlightIndices(entry.title, entry.indices, (key, text, bold) =>
            bold ? <strong key={key} className="font-semibold text-kumo-strong">{text}</strong> : <span key={key}>{text}</span>)}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-[11.5px] leading-4 text-kumo-inactive">
          <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">{entry.moduleIcon}</span>
          <span className="truncate">{entry.section ? `${entry.module} · ${entry.section}` : entry.module}</span>
        </span>
      </span>
      <KindPill kind={entry.kind} />
      <kbd className={['hidden w-5 shrink-0 text-center font-sans text-[12px] text-kumo-inactive sm:block', row.active ? 'visible' : 'invisible'].join(' ')}>↵</kbd>
    </Row>
  )
}

/** "Ask the assistant": closes the list when the query is non-empty. */
export function AssistantRow({ query, icon, ...row }: Omit<RowProps, 'children'> & { query: string; icon: ReactNode }) {
  return (
    <Row {...row}>
      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-kumo-brand/10 text-kumo-brand">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] leading-5 tracking-[-0.2px] text-kumo-default">
        Ask the assistant: <span className="text-kumo-strong">"{query}"</span>
      </span>
      <kbd className={['hidden w-5 shrink-0 text-center font-sans text-[12px] text-kumo-inactive sm:block', row.active ? 'visible' : 'invisible'].join(' ')}>↵</kbd>
    </Row>
  )
}
