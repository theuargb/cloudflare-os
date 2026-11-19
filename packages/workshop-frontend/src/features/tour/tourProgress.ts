// Which tours (and versions) the user has finished, kept per user on the server (user preferences).

import { readUserPreference, writeUserPreference } from '../user-preferences/userPreferences'

const TOURS_COMPLETED_PREFERENCE = 'tours.completed'

/** Tour key → highest finished version; empty when nothing is stored or the value is unreadable. */
export const readCompletedTours = (): Record<string, number> => {
  try {
    const parsed: unknown = JSON.parse(readUserPreference(TOURS_COMPLETED_PREFERENCE) ?? '{}')
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

export const markTourCompleted = (key: string, version: number): void => {
  const completed = readCompletedTours()
  completed[key] = Math.max(completed[key] ?? 0, version)
  writeUserPreference(TOURS_COMPLETED_PREFERENCE, JSON.stringify(completed))
}
