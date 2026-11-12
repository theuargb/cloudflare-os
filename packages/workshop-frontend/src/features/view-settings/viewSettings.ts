// The view settings of the «Appearance» menu, kept per user with the other UI preferences. Density and
// text size are what every gatekeeper app screen follows (pushed to open frames over `subscribeView`);
// the text size also scales the sidebar (useAppTextSize). Density and text size keep the keys the apps
// wrote themselves before the Workshop owned the menu (`app:<key>`), so stored choices carry over.

import {
  APP_DEFAULT_VIEW,
  APP_DENSITIES,
  APP_TEXT_SIZES,
  type AppDensity,
  type AppTextSize,
  type AppViewSettings,
} from '@gadgets/workshop-shared/app-host'
import { readUserPreference, useUserPreference, writeUserPreference } from '../user-preferences/userPreferences'

const DENSITY_PREFERENCE = 'app:density'
const TEXT_SIZE_PREFERENCE = 'app:text-size'
/** «Open menu items in a new tab»: set (`ON`) or absent. */
const NAV_NEW_TAB_PREFERENCE = 'nav.new-tab'
const ON = '1'

const NEW_TAB = { target: '_blank', rel: 'noopener' } as const

function parseDensity(raw: string | null): AppDensity {
  return APP_DENSITIES.find((value) => value === raw) ?? APP_DEFAULT_VIEW.density
}

function parseTextSize(raw: string | null): AppTextSize {
  return APP_TEXT_SIZES.find((value) => value === raw) ?? APP_DEFAULT_VIEW.textSize
}

/** The current view settings, outside React (the value a frame gets when it subscribes). */
export function readViewSettings(): AppViewSettings {
  return {
    density: parseDensity(readUserPreference(DENSITY_PREFERENCE)),
    textSize: parseTextSize(readUserPreference(TEXT_SIZE_PREFERENCE)),
  }
}

/** The current view settings; unknown or missing values are the defaults. */
export function useViewSettings(): AppViewSettings {
  const density = parseDensity(useUserPreference(DENSITY_PREFERENCE))
  const textSize = parseTextSize(useUserPreference(TEXT_SIZE_PREFERENCE))
  return { density, textSize }
}

export function setViewDensity(value: AppDensity): void {
  writeUserPreference(DENSITY_PREFERENCE, value)
}

export function setViewTextSize(value: AppTextSize): void {
  writeUserPreference(TEXT_SIZE_PREFERENCE, value)
}

/** Whether main navigation entries open in a new browser tab. */
export function useNavNewTab(): boolean {
  return useUserPreference(NAV_NEW_TAB_PREFERENCE) === ON
}

export function setNavNewTab(on: boolean): void {
  writeUserPreference(NAV_NEW_TAB_PREFERENCE, on ? ON : null)
}

/** Link props that open an in-app navigation link in a new browser tab when `on`. */
export function newTabProps(on: boolean): { target?: '_blank'; rel?: 'noopener' } {
  return on ? NEW_TAB : {}
}
