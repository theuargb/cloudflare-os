import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Checkbox, Popover } from '@cloudflare/kumo'
import { CheckIcon, SlidersHorizontalIcon } from '@phosphor-icons/react'
import { APP_DEFAULT_VIEW, APP_DENSITIES, APP_TEXT_SIZES, type AppDensity } from '@gadgets/workshop-shared/app-host'
import { MENU_CONTENT } from '../../components/menuStyles'
import { useOpenAppId } from '../app-section-nav/sectionNavHooks'
import { homeTourRequest } from '../tour/homeTour'
import { replayAppTour, requestTour } from '../tour/tourStore'
import { setNavNewTab, setViewDensity, setViewTextSize, useNavNewTab, useViewSettings } from './viewSettings'

const TRIGGER =
  'press flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-kumo-line bg-kumo-base text-kumo-default transition-colors hover:bg-kumo-tint data-[popup-open]:bg-kumo-tint'
const GROUP_LABEL = 'px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-kumo-subtle'
const ROW =
  'flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] leading-[18px] text-kumo-default hover:bg-kumo-tint disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent'
const STEP = `${ROW} justify-center whitespace-nowrap`
const SEPARATOR = <div className="my-1 h-px bg-kumo-line" />

const DENSITY_LABELS: Record<AppDensity, string> = { comfortable: 'Comfortable', compact: 'Compact' }

/**
 * The «Appearance» menu right after the «Menu» launcher, on every screen: density and text size of the
 * app screens (and the sidebar's text), «Open menu items in a new tab», and the interface tour of the
 * screen on view (the open app's tour, else the home tour). Changes apply at once; the panel stays open.
 */
export default function ViewSettingsMenu() {
  const [open, setOpen] = useState(false)
  const { density, textSize } = useViewSettings()
  const newTab = useNavNewTab()
  const openAppId = useOpenAppId()
  const navigate = useNavigate()
  const sizeIndex = APP_TEXT_SIZES.indexOf(textSize)

  const startTour = () => {
    setOpen(false)
    if (replayAppTour(openAppId)) return
    requestTour(homeTourRequest(true))
    void navigate({ to: '/' })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <button type="button" data-tour="app-view" aria-label="Appearance" title="Appearance" className={TRIGGER}>
            <SlidersHorizontalIcon size={14} aria-hidden className="text-kumo-subtle" />
          </button>
        }
      />
      <Popover.Content side="bottom" align="end" sideOffset={6} className={`${MENU_CONTENT} !w-60`}>
        <div role="group" aria-label="Density">
          <div className={GROUP_LABEL}>Density</div>
          {APP_DENSITIES.map((value) => (
            <button key={value} type="button" onClick={() => setViewDensity(value)} className={ROW}>
              <span className="flex size-4 items-center justify-center">
                {value === density ? <CheckIcon size={14} aria-hidden /> : null}
              </span>
              {DENSITY_LABELS[value]}
            </button>
          ))}
        </div>
        {SEPARATOR}
        <div role="group" aria-label="Text size">
          <div className={GROUP_LABEL}>Text size</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={sizeIndex <= 0}
              onClick={() => setViewTextSize(APP_TEXT_SIZES[sizeIndex - 1]!)}
              aria-label="Smaller text"
              title="Smaller text"
              className={`${STEP} w-9 shrink-0`}
            >
              <span className="text-[12px] font-semibold">A</span>
            </button>
            <button
              type="button"
              onClick={() => setViewTextSize(APP_DEFAULT_VIEW.textSize)}
              aria-label="Default text size"
              title="Default text size"
              className={`${STEP} min-w-0 flex-1 tabular-nums`}
            >
              {Number(textSize).toLocaleString(document.documentElement.lang || undefined)} %
            </button>
            <button
              type="button"
              disabled={sizeIndex >= APP_TEXT_SIZES.length - 1}
              onClick={() => setViewTextSize(APP_TEXT_SIZES[sizeIndex + 1]!)}
              aria-label="Larger text"
              title="Larger text"
              className={`${STEP} w-9 shrink-0`}
            >
              <span className="text-[17px] font-semibold">A</span>
            </button>
          </div>
        </div>
        {SEPARATOR}
        <div className="px-2.5 py-1.5 text-[13px] leading-[18px]">
          <Checkbox
            label="Open menu items in a new tab"
            checked={newTab}
            onCheckedChange={(checked) => setNavNewTab(checked === true)}
          />
        </div>
        {SEPARATOR}
        <button type="button" onClick={startTour} className={ROW}>
          <span className="size-4" />
          Interface tour
        </button>
      </Popover.Content>
    </Popover>
  )
}
