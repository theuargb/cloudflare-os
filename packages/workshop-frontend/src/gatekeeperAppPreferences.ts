// Small UI preferences shared by every sandboxed gatekeeper app (e.g. its navigation layout). The
// frame runs at an opaque origin with no storage of its own, so Workshop keeps them in its own
// localStorage. Keys and values come from untrusted frames and are validated and size-bounded.

const KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/
const MAX_VALUE_LENGTH = 256
const STORAGE_PREFIX = 'gatekeeper-app-preference:'

function storageKey(key: unknown): string {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new TypeError('Invalid app preference key.')
  }
  return STORAGE_PREFIX + key
}

export function readGatekeeperAppPreference(key: unknown): string | null {
  const name = storageKey(key)
  try {
    return localStorage.getItem(name)
  } catch {
    return null
  }
}

export function writeGatekeeperAppPreference(key: unknown, value: unknown): void {
  const name = storageKey(key)
  if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) {
    throw new TypeError('Invalid app preference value.')
  }
  try {
    localStorage.setItem(name, value)
  } catch {
    // Storage disabled or full: the preference simply does not persist.
  }
}
