import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Popover } from '@cloudflare/kumo'
import { BellIcon, InfoIcon, WarningIcon, WarningOctagonIcon } from '@phosphor-icons/react'
import type { AppInboxItem, AppInboxSeverity } from '@gadgets/workshop-shared/app-host'
import { useInbox } from './useInbox'

const SEVERITY_ICONS: Record<AppInboxSeverity, { icon: typeof InfoIcon, className: string }> = {
  info: { icon: InfoIcon, className: 'text-kumo-link' },
  warning: { icon: WarningIcon, className: 'text-kumo-warning' },
  error: { icon: WarningOctagonIcon, className: 'text-kumo-danger' },
}

const relative = new Intl.RelativeTimeFormat('uk', { numeric: 'auto', style: 'short' })

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000)
  if (minutes > -1) return 'щойно'
  if (minutes > -60) return relative.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours > -24) return relative.format(hours, 'hour')
  return relative.format(Math.round(hours / 24), 'day')
}

/**
 * Topbar bell of the deployment's inbox provider (AccountDescription.providesInbox): unread badge
 * and the latest entries. Hidden when no gatekeeper provides an inbox.
 */
export default function InboxBell() {
  const navigate = useNavigate()
  const { inbox, refresh, markRead } = useInbox()
  const [open, setOpen] = useState(false)
  if (!inbox) return null

  const pick = (item: AppInboxItem) => {
    setOpen(false)
    if (item.unread) markRead([item.id])
    if (item.appId && item.route) {
      navigate({ to: '/gatekeepers/$appId', params: { appId: item.appId }, search: { at: item.route } })
    }
  }
  const openAll = () => {
    setOpen(false)
    navigate({ to: '/gatekeepers/$appId', params: { appId: inbox.appId }, search: {} })
  }
  const badge = inbox.unread > 99 ? '99+' : String(inbox.unread)

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) refresh() }}>
      <Popover.Trigger
        render={
          <button
            type="button"
            aria-label={inbox.unread > 0 ? `Сповіщення: ${badge} непрочитаних` : 'Сповіщення'}
            title="Сповіщення"
            className="press relative flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-kumo-inactive transition-colors hover:bg-kumo-tint hover:text-kumo-default"
          >
            <BellIcon size={17} />
            {inbox.unread > 0 && (
              <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-kumo-danger px-1 text-center text-[10px] font-semibold leading-4 text-white">
                {badge}
              </span>
            )}
          </button>
        }
      />
      <Popover.Content
        align="end"
        side="bottom"
        sideOffset={6}
        positionMethod="fixed"
        className="themed-floating-shadow !z-[1100] !w-[min(380px,calc(100vw-24px))] !min-w-0 overflow-hidden rounded-xl border border-kumo-line bg-kumo-base !p-0 !outline-none [&>:first-child]:hidden"
      >
        <div className="flex items-center justify-between border-b border-kumo-line px-3.5 py-2.5">
          <Popover.Title className="text-[13px] font-medium text-kumo-default">Сповіщення</Popover.Title>
          {inbox.unread > 0 && (
            <button
              type="button"
              onClick={() => markRead([])}
              className="cursor-pointer rounded-md px-1.5 py-0.5 text-[12px] text-kumo-link hover:bg-kumo-tint"
            >
              Позначити всі прочитаними
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {inbox.items.length === 0 && (
            <p className="px-3.5 py-6 text-center text-[12.5px] text-kumo-subtle">Нових сповіщень немає</p>
          )}
          {inbox.items.map((item) => {
            const { icon: Icon, className } = SEVERITY_ICONS[item.severity]
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => pick(item)}
                className="flex w-full cursor-pointer gap-2.5 border-b border-kumo-line px-3.5 py-2.5 text-left last:border-b-0 hover:bg-kumo-tint"
              >
                <Icon size={16} weight="fill" className={`mt-0.5 shrink-0 ${className}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-[13px] ${item.unread ? 'font-semibold text-kumo-default' : 'text-kumo-subtle'}`}>
                    {item.title}
                  </span>
                  {item.body && <span className="line-clamp-2 text-[12px] text-kumo-subtle">{item.body}</span>}
                  <span className="text-[11px] text-kumo-inactive">{timeAgo(item.createdAt)}</span>
                </span>
                {item.unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-kumo-brand" aria-label="Непрочитане" />}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={openAll}
          className="w-full cursor-pointer border-t border-kumo-line px-3.5 py-2 text-center text-[12.5px] font-medium text-kumo-link hover:bg-kumo-tint"
        >
          Усі сповіщення
        </button>
      </Popover.Content>
    </Popover>
  )
}
