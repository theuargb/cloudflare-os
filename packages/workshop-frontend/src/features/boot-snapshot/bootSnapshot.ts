// What the app chrome needs for its first paint, kept from the previous visit so the sidebar and the
// top bar render at once and only refresh when the server answers: the user's UI preferences, the
// apps list, whether onboarding is done (per signed-in session), and the deployment's public config.
// A snapshot belongs to the session that wrote it; another token (or none) never sees it.

import type { GatekeeperAppInfo, ServerConfig } from '@gadgets/workshop-shared/api'
import { CF_ACCESS_MODE } from '../../useAuth'

const SNAPSHOT_KEY = 'gadgets:boot-snapshot'
const SERVER_CONFIG_KEY = 'gadgets:server-config'

type BootSnapshot = {
  v: 1
  owner: string
  preferences: Record<string, string>
  apps: GatekeeperAppInfo[]
  onboardingDone: boolean
}

/** 32-bit FNV-1a, hex: tells sessions apart without copying the token (which sits in the same storage). */
function fnv1a32(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16)
}

/** The current session's identity, or null when signed out. */
function currentOwner(): string | null {
  if (CF_ACCESS_MODE) return 'cf-access'
  const token = localStorage.getItem('authToken')
  return token ? fnv1a32(token) : null
}

// `undefined` = not read yet; the stored copy is parsed once per page.
let memo: BootSnapshot | null | undefined

function parseSnapshot(): BootSnapshot | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) ?? 'null') as BootSnapshot | null
    return parsed?.v === 1 ? parsed : null
  } catch {
    return null
  }
}

/** The snapshot of the signed-in session, or null (none, unreadable, or another session's). */
export function readBootSnapshot(): BootSnapshot | null {
  if (memo === undefined) memo = parseSnapshot()
  const owner = currentOwner()
  return memo && owner && memo.owner === owner ? memo : null
}

/** Merges fresh server answers into the signed-in session's snapshot. */
export function writeBootSnapshot(patch: Partial<Pick<BootSnapshot, 'preferences' | 'apps' | 'onboardingDone'>>): void {
  const owner = currentOwner()
  if (!owner) return
  const base: BootSnapshot = readBootSnapshot() ?? { v: 1, owner, preferences: {}, apps: [], onboardingDone: false }
  memo = { ...base, ...patch }
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(memo))
  } catch {
    /* quota: the next visit loads without a snapshot */
  }
}

/** Sign-out: the next session starts from the server. */
export function clearBootSnapshot(): void {
  memo = null
  try {
    localStorage.removeItem(SNAPSHOT_KEY)
  } catch {
    /* storage unavailable */
  }
}

/** The deployment config of the previous visit (public: site name, logo, accent colour). */
export function readStoredServerConfig(): ServerConfig | null {
  try {
    return JSON.parse(localStorage.getItem(SERVER_CONFIG_KEY) ?? 'null') as ServerConfig | null
  } catch {
    return null
  }
}

/** Keeps the latest deployment config for the next visit's first paint. */
export function writeStoredServerConfig(config: ServerConfig): void {
  try {
    localStorage.setItem(SERVER_CONFIG_KEY, JSON.stringify(config))
  } catch {
    /* quota */
  }
}
