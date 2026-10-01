import { MagnifyingGlassIcon } from '@phosphor-icons/react'
import SpotlightPanel from './SpotlightPanel'
import { openCommandPalette } from '../AppShell/commandPaletteBus'

// Search (⌘K): the launcher for actions inside modules (create, journals, reports, operations,
// settings); the sidebar navigates to modules. Keyboard-driven and opened many times a day, so it
// deliberately has no open/close animation.

/** Full-page modal: full-screen on mobile, a large centred sheet on desktop. */
export default function Spotlight({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[1500] flex items-stretch justify-center sm:items-start sm:px-4 sm:pt-[8vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/20" aria-hidden="true" onMouseDown={onClose} />
      <div className="themed-floating-shadow-lg relative flex w-full flex-col overflow-hidden bg-kumo-base sm:h-[min(80vh,720px)] sm:max-w-[760px] sm:rounded-xl sm:border sm:border-kumo-line">
        <SpotlightPanel onDone={onClose} />
      </div>
    </div>
  )
}

/** Topbar field that opens the modal; an icon button on mobile. */
export function SpotlightTrigger() {
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'
  return (
    <button
      type="button"
      onClick={openCommandPalette}
      aria-label="Search"
      title={`Search (${shortcut})`}
      className="press flex h-9 cursor-pointer items-center gap-2 rounded-lg text-[13px] text-kumo-inactive transition-colors hover:bg-kumo-tint hover:text-kumo-default max-md:w-9 max-md:justify-center md:w-[min(420px,40vw)] md:border md:border-kumo-line md:px-3"
    >
      <MagnifyingGlassIcon size={15} className="shrink-0" />
      <span className="hidden flex-1 truncate text-left md:inline">Search actions: create, report, journal…</span>
      <kbd className="hidden shrink-0 rounded border border-kumo-line px-1.5 py-0.5 font-sans text-[10px] leading-none md:inline">{shortcut}</kbd>
    </button>
  )
}
