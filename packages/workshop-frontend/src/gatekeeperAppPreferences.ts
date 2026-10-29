// Small UI preferences shared by every sandboxed gatekeeper app (e.g. its navigation layout). The
// frame runs at an opaque origin with no storage of its own, so Workshop keeps them per user on the
// server with the user's other UI preferences (`app:<key>`). Keys and values come from untrusted
// frames and are validated and size-bounded.

import { readUserPreference, writeUserPreference } from './features/user-preferences/userPreferences'

const KEY_PATTERN = /^[a-z][a-z0-9-]{0,39}$/
const MAX_VALUE_LENGTH = 256

function preferenceKey(key: unknown): string {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new TypeError('Invalid app preference key.')
  }
  return `app:${key}`
}

export function readGatekeeperAppPreference(key: unknown): string | null {
  return readUserPreference(preferenceKey(key))
}

export function writeGatekeeperAppPreference(key: unknown, value: unknown): void {
  const name = preferenceKey(key)
  if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) {
    throw new TypeError('Invalid app preference value.')
  }
  writeUserPreference(name, value)
}
