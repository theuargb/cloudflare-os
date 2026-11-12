// The text size of the «Appearance» menu (viewSettings.ts) also scales the sidebar's text: the value
// goes to `<html data-app-text-size>`, which drives `--app-text-scale` (appTextSize.css).

import { useEffect } from 'react'
import { useViewSettings } from '../view-settings/viewSettings'
import './appTextSize.css'

/** Mirrors the apps' shared text size onto the Workshop document while the shell is mounted. */
export function useAppTextSize(): void {
  const { textSize } = useViewSettings()
  useEffect(() => {
    const root = document.documentElement
    root.dataset.appTextSize = textSize
    return () => {
      delete root.dataset.appTextSize
    }
  }, [textSize])
}
