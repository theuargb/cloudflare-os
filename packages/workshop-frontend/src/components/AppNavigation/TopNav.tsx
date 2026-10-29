import { ListMagnifyingGlassIcon } from '@phosphor-icons/react'
import { openCommandPalette } from '../AppShell/commandPaletteBus'

/** The topbar Menu button (md and up): opens the launcher (Spotlight) — a search field over every module action, grouped by type. ⌘K / Ctrl+K and `/` open it too; on mobile the sidebar's search button does. */
export default function TopNav() {
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K'
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={openCommandPalette}
      title={`Menu (${shortcut})`}
      className="press hidden h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-kumo-line bg-kumo-base px-2.5 text-[13px] font-medium text-kumo-default transition-colors hover:bg-kumo-tint md:flex"
    >
      <ListMagnifyingGlassIcon size={14} aria-hidden />
      Menu
      <kbd className="rounded border border-kumo-line px-1 py-0.5 font-sans text-[10px] font-normal leading-none text-kumo-inactive">{shortcut}</kbd>
    </button>
  )
}
