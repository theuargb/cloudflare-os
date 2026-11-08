// The text size gatekeeper apps share (`app:text-size`, percent of the default) also scales the
// sidebar's text: the value goes to `<html data-app-text-size>`, which drives `--app-text-scale`
// (appTextSize.css). An unknown or missing value keeps the default size.

import { useEffect } from 'react'
import { useUserPreference } from '../user-preferences/userPreferences'
import './appTextSize.css'

const TEXT_SIZES: readonly string[] = ['85', '92.5', '100', '110', '125']

/** Mirrors the apps' shared text size onto the Workshop document while the shell is mounted. */
export function useAppTextSize(): void {
  const value = useUserPreference('app:text-size')
  const size = value !== null && TEXT_SIZES.includes(value) ? value : null
  useEffect(() => {
    const root = document.documentElement
    if (size === null) delete root.dataset.appTextSize
    else root.dataset.appTextSize = size
    return () => {
      delete root.dataset.appTextSize
    }
  }, [size])
}
