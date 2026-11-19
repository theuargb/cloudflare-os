import { useEffect } from 'react'
import SpotlightPanel from './SpotlightPanel'
import { openCommandPalette } from '../AppShell/commandPaletteBus'

// The Menu launcher (topbar Menu button, ⌘K, `/`): search over every module action, grouped by type
// (documents, registers, journals, reports, references, classifiers, settings, other); the sidebar
// navigates to modules. Keyboard-driven and opened many times a day, so it deliberately has no
// open/close animation.

/** Full-page modal: full-screen on mobile, a large centred sheet on desktop. */
export default function Spotlight({ open, onClose }: { open: boolean; onClose: () => void }) {
  // The shell's own handler covers ⌘K / Ctrl+K on a Latin layout. Here: the same chord on other
  // layouts (the physical K key reports another character, e.g. Cyrillic), and `/` outside text fields.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK' && e.key.toLowerCase() !== 'k') {
        e.preventDefault()
        if (open) onClose()
        else openCommandPalette()
        return
      }
      const target = e.target
      const typing = target instanceof HTMLElement
        && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing) {
        e.preventDefault()
        openCommandPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[1500] flex items-stretch justify-center sm:items-start sm:px-4 sm:pt-[8vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/20" aria-hidden="true" onMouseDown={onClose} />
      <div className="themed-floating-shadow-lg relative flex w-full flex-col overflow-hidden bg-kumo-base sm:h-[min(80vh,720px)] sm:max-w-[880px] sm:rounded-xl sm:border sm:border-kumo-line">
        <SpotlightPanel onDone={onClose} />
      </div>
    </div>
  )
}

