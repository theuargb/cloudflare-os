/**
 * Per-user recency/frequency persistence for search picks. Stored in localStorage under a single
 * key; entries are evicted on a max-entries cap (LRU by last-pick time).
 */

const STORAGE_KEY = 'gadgets:spotlight-recents'
const MAX_ENTRIES = 50

export type RecentEntry = {
  /** Stable pick identifier, e.g. `app:semantyka:accounts/new` or `workspace:abc`. */
  id: string
  /** Unix-ms of the most recent pick. */
  lastUsed: number
  /** Cumulative pick count. */
  count: number
}

function load(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(entries: RecentEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch { /* quota exceeded – ignore */ }
}

/** Record a pick. Returns the updated list (most-recent first). */
export function recordPick(id: string): RecentEntry[] {
  const entries = load()
  const existing = entries.find(e => e.id === id)
  if (existing) {
    existing.lastUsed = Date.now()
    existing.count += 1
  } else {
    entries.push({ id, lastUsed: Date.now(), count: 1 })
  }
  entries.sort((a, b) => b.lastUsed - a.lastUsed)
  save(entries)
  return entries
}

/** Get recents sorted by last-used time (most recent first). */
export function getRecents(): RecentEntry[] {
  return load().toSorted((a, b) => b.lastUsed - a.lastUsed)
}

/**
 * Recency score boost for ranking. Picks within the last hour get the most; decays by half-life.
 */
export function recencyScore(id: string, recents: RecentEntry[]): number {
  const entry = recents.find(e => e.id === id)
  if (!entry) return 0
  const age = Date.now() - entry.lastUsed
  const HOUR = 3_600_000
  // Half-life: ~2 hours → halves every 2 hours of age; frequency adds up to +5.
  const timeBoost = 15 * Math.pow(0.5, age / (2 * HOUR))
  const freqBoost = Math.min(entry.count, 5)
  return timeBoost + freqBoost
}
