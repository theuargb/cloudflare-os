import { useState } from 'react'
import { DropdownMenu } from '@cloudflare/kumo'
import { Check } from '@phosphor-icons/react'
import { useAuthenticatedApi } from '../../AuthContext'
import { logRpcFailure } from '../../rpcErrors'
import { switchUiLocale, uiLocale, uiLocaleName, uiLocales } from '../../uiLocale'
import { MENU_CONTENT, MENU_ITEM, MENU_POSITIONER_STYLE } from '../menuStyles'

/**
 * Language picker of the sidebar's bottom strip: shown only when the build serves several
 * languages. Picking one saves it as the user's preference and reloads the page into it.
 */
export default function LocaleMenu() {
  const { authenticatedApi } = useAuthenticatedApi()
  const [switching, setSwitching] = useState(false)

  if (uiLocales.length < 2) return null

  const label = `Language: ${uiLocaleName(uiLocale)}`

  const choose = (code: string) => {
    if (code === uiLocale) return
    setSwitching(true)
    switchUiLocale(authenticatedApi, code).catch((err: unknown) => {
      logRpcFailure('Failed to save the language:', err)
      setSwitching(false)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <button
            type="button"
            disabled={switching}
            title={label}
            aria-label={label}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[11px] font-semibold text-kumo-inactive transition-colors hover:bg-kumo-tint hover:text-kumo-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-ring focus-visible:ring-offset-2 focus-visible:ring-offset-kumo-elevated disabled:cursor-default disabled:opacity-60"
          >
            {uiLocale.toUpperCase()}
          </button>
        }
      />
      <DropdownMenu.Content className={MENU_CONTENT} style={MENU_POSITIONER_STYLE}>
        {uiLocales.map((code) => (
          <DropdownMenu.Item key={code} onClick={() => choose(code)} className={MENU_ITEM}>
            <span className="flex w-full items-center justify-between gap-3">
              {uiLocaleName(code)}
              {code === uiLocale && <Check size={14} />}
            </span>
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
