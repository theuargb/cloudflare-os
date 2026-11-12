// The language of this page. The build serves the languages of VITE_UI_LOCALES: the ui-locale
// plugin compiles every translated string into a choice on `uiLocale`, so the value is fixed when
// the page loads and changing the language reloads it. The choice lives in the user's `ui.locale`
// UI preference; localStorage caches it so the first paint after a reload is already in it.

import type { RpcStub } from 'capnweb'
import { UI_LOCALE_PREFERENCE, type AuthenticatedApi } from '@gadgets/workshop-shared/api'

const STORAGE_KEY = 'gadgets:ui-locale'

/** The languages this build serves, the first being the deployment's default; empty = English only. */
export const uiLocales: readonly string[] = (import.meta.env.VITE_UI_LOCALES ?? '').split(',').filter(Boolean)

/** `requested` when this build serves it, else the default. */
export function resolveUiLocale(requested: string | null): string {
  return requested !== null && uiLocales.includes(requested) ? requested : (uiLocales[0] ?? 'en')
}

function readStoredLocale(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Whether the cache took the value; a broken storage must never make the page reload in a loop. */
function writeStoredLocale(locale: string): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, locale)
    return true
  } catch {
    return false
  }
}

/** The language of this page; read by the compiled strings through `virtual:ui-locale`. */
export const uiLocale = resolveUiLocale(readStoredLocale())

if (uiLocales.length > 0) document.documentElement.lang = uiLocale

/** Reloads into the user's saved language when the page was loaded in another one. */
export function followPreferredUiLocale(preference: string | null): void {
  const wanted = resolveUiLocale(preference)
  if (wanted === uiLocale) return
  if (writeStoredLocale(wanted)) location.reload()
}

/** Saves the language as the user's preference, then reloads into it. */
export async function switchUiLocale(api: RpcStub<AuthenticatedApi>, locale: string): Promise<void> {
  await api.setUiPreference(UI_LOCALE_PREFERENCE, locale)
  writeStoredLocale(locale)
  location.reload()
}

/** A language's name in itself (the autonym), e.g. the Ukrainian and Georgian names of those languages. */
export function uiLocaleName(locale: string): string {
  const name = new Intl.DisplayNames([locale], { type: 'language' }).of(locale)
  return name ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1) : locale
}
