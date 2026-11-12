import type { MouseEvent } from 'react'
import { PencilSimple } from '@phosphor-icons/react'
import type { DropIndicator } from './useSidebarDrag'

/** The insertion line of a drag, on the row or group it belongs to. */
export const DropLine = ({ indicator, id, inset }: { indicator: DropIndicator | null; id: string; inset: string }) =>
  indicator?.key === id ? (
    <span
      aria-hidden
      className={[
        'pointer-events-none absolute z-10 h-0.5 rounded-full bg-kumo-brand',
        inset,
        indicator.edge === 'top' ? '-top-px' : '-bottom-px',
      ].join(' ')}
    />
  ) : null

/** Renames a row or a group; hover-revealed, the click never reaches the row's link or toggle. */
export const RenameButton = ({ label, group, onClick }: { label: string; group?: 'section'; onClick: () => void }) => (
  <button
    type="button"
    aria-label={`Rename "${label}"`}
    title="Rename"
    onClick={(event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      onClick()
    }}
    className={[
      'flex h-6 w-6 cursor-pointer items-center justify-center rounded-md text-kumo-inactive opacity-0 transition-opacity hover:bg-kumo-fill hover:text-kumo-default focus-visible:opacity-100',
      group === 'section' ? 'group-hover/section:opacity-100' : 'group-hover/item:opacity-100',
    ].join(' ')}
  >
    <PencilSimple size={12} />
  </button>
)
