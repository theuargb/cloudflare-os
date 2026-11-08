import { useEffect, useRef } from 'react'
import { BuildingsIcon, CalendarBlankIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { APP_TOPBAR_ACTION, type AppTopbarAction, type AppTopbarControl, type AppTopbarIcon } from '@gadgets/workshop-shared/app-host'
import { useOpenAppId } from '../app-section-nav/sectionNavHooks'
import { activateAppTopbar, useAppTopbar } from './topbarStore'

const ICONS: Record<AppTopbarIcon, typeof CalendarBlankIcon> = { calendar: CalendarBlankIcon, organization: BuildingsIcon }

const STEP = 'hidden cursor-pointer items-center px-1.5 text-kumo-subtle transition-colors hover:bg-kumo-tint md:flex'

/**
 * The open app's context controls (period, organization) before the inbox: compact triggers sized to
 * their label; below `md` only the icon. The app draws each picker in its frame under the trigger.
 */
export default function AppTopbarControls() {
  const appId = useOpenAppId()
  const controls = useAppTopbar(appId)
  if (!appId || controls.length === 0) return null
  return (
    <div className="flex min-w-0 items-center gap-2">
      {controls.map((control) => (
        <TopbarControl key={control.id} appId={appId} control={control} />
      ))}
    </div>
  )
}

function TopbarControl({ appId, control }: { appId: string, control: AppTopbarControl }) {
  const ref = useRef<HTMLDivElement>(null)
  // The open state when the press started: the frame may close its picker on that very press (focus
  // leaves it). A keyboard click has no press and reads the current state.
  const wasOpen = useRef(false)
  const activate = (action: AppTopbarAction) => {
    if (ref.current) activateAppTopbar(appId, control.id, action, ref.current.getBoundingClientRect())
  }
  const Icon = ICONS[control.icon]

  // A press elsewhere in the Workshop, or Escape, closes the picker (presses inside the frame are the app's).
  useEffect(() => {
    if (!control.open) return
    const close = () => activate(APP_TOPBAR_ACTION.close)
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  })

  return (
    <div ref={ref} className="flex h-8 shrink-0 items-stretch overflow-hidden rounded-lg border border-kumo-line bg-kumo-base">
      {control.stepper ? (
        <button type="button" aria-label={`Step back: ${control.title}`} onClick={() => activate(APP_TOPBAR_ACTION.previous)} className={STEP}>
          <CaretLeftIcon size={12} aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        title={control.title}
        aria-label={control.title}
        aria-haspopup="dialog"
        aria-expanded={control.open}
        onPointerDown={() => {
          wasOpen.current = control.open === true
        }}
        onClick={(event) => activate((event.detail === 0 ? control.open : wasOpen.current) ? APP_TOPBAR_ACTION.close : APP_TOPBAR_ACTION.open)}
        className={`press flex min-w-0 cursor-pointer items-center gap-1.5 px-2 text-[13px] font-medium text-kumo-default transition-colors hover:bg-kumo-tint md:px-2.5 ${control.open ? 'bg-kumo-tint' : ''} ${control.stepper ? 'md:border-x md:border-kumo-line' : ''}`}
      >
        <Icon size={14} className="shrink-0 text-kumo-subtle" aria-hidden />
        <span className="hidden max-w-40 truncate md:inline">{control.label}</span>
      </button>
      {control.stepper ? (
        <button type="button" aria-label={`Step forward: ${control.title}`} onClick={() => activate(APP_TOPBAR_ACTION.next)} className={STEP}>
          <CaretRightIcon size={12} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}
