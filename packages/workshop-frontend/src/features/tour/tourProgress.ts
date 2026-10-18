// Which tours (and versions) a user has finished, kept in this browser only.

const STORAGE_PREFIX = 'workshop.tours.completed:'

/** Tour key → highest finished version; empty when nothing is stored or storage is unreadable. */
export const readCompletedTours = (userId: string): Record<string, number> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + userId) ?? '{}')
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const completed: Record<string, number> = {}
    for (const [key, version] of Object.entries(parsed)) {
      if (typeof version === 'number' && Number.isFinite(version)) completed[key] = version
    }
    return completed
  } catch {
    return {}
  }
}

export const markTourCompleted = (userId: string, key: string, version: number): void => {
  const completed = readCompletedTours(userId)
  completed[key] = Math.max(completed[key] ?? 0, version)
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(completed))
  } catch {
    // Storage disabled or full: the tour simply shows again.
  }
}
