import type { SpotlightType, TypeCounts } from './catalog'

/** The type picker: a vertical rail beside the results (≥ sm) or a chip row under the field (below sm). */
export function TypeTabs(props: {
  variant: 'rail' | 'chips'
  types: { type: SpotlightType; label: string }[]
  selected: SpotlightType
  counts: TypeCounts
  onSelect: (type: SpotlightType) => void
}) {
  const { variant, types, selected, counts, onSelect } = props
  const rail = variant === 'rail'
  return (
    <div
      role="tablist"
      aria-label="Action type"
      aria-orientation={rail ? 'vertical' : 'horizontal'}
      className={rail
        ? 'hidden w-48 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-kumo-line p-1.5 sm:flex'
        : 'flex gap-1.5 overflow-x-auto border-b border-kumo-line px-4 pb-3 sm:hidden'}
    >
      {types.map(({ type, label }) => {
        const active = type === selected
        const count = counts[type]
        const dim = count === 0 && !active ? 'opacity-50' : ''
        return (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(type)}
            className={rail
              ? `flex h-8 shrink-0 cursor-pointer items-center justify-between rounded-md px-2.5 text-left text-[13px] transition-colors hover:bg-kumo-tint ${active ? 'bg-kumo-tint font-medium text-kumo-strong' : 'text-kumo-default'} ${dim}`
              : `flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors ${active ? 'border-kumo-brand bg-kumo-brand/10 font-medium text-kumo-brand' : 'border-kumo-line text-kumo-subtle hover:bg-kumo-tint'} ${dim}`}
          >
            {label}
            <span className={rail ? 'text-[12px] tabular-nums text-kumo-inactive' : active ? 'opacity-70' : 'text-kumo-inactive'}>{count}</span>
          </button>
        )
      })}
    </div>
  )
}
