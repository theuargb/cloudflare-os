// Where the desktop navigation sits: the expanded sidebar, the collapsed rail or the top bar.
// Kept per browser (a laptop and a wide monitor may differ); mobile always uses the drawer.

/** `sidebar` = expanded rail, `rail` = collapsed rail, `top` = horizontal top bar. */
export type NavLayout = 'sidebar' | 'rail' | 'top'

const STORAGE_KEY = 'gadgets:nav-layout'
const LAYOUTS: readonly NavLayout[] = ['sidebar', 'rail', 'top']

/** The saved layout; `sidebar` when none is saved, the value is unknown or storage is unavailable. */
export function readNavLayout(): NavLayout {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return LAYOUTS.find((layout) => layout === saved) ?? 'sidebar'
  } catch {
    return 'sidebar'
  }
}

/** Saves the layout for this browser; storage failures are ignored (the layout lasts the session). */
export function saveNavLayout(layout: NavLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, layout)
  } catch {}
}
