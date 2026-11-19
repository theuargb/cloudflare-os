import { useNavigate } from '@tanstack/react-router'
import { ArrowRightIcon } from '@phosphor-icons/react'
import { useGatekeeperApps } from '../../useGatekeeperApps'
import { GatekeeperAppIcon } from '../../components/GatekeeperAppIcon'
import { preloadAppRoute, preloadIntent } from '../app-preload/appPreload'
import { useAppNavigation } from '../../components/AppNavigation/useAppNavigation'
import { useAppWork } from './useAppWork'

/**
 * Home "My work": the user's non-empty work queues across the management apps (title, open count,
 * module and organization), each opening its queue in one click. Hidden while nothing waits.
 */
export default function MyWork() {
  const work = useAppWork()
  const apps = useGatekeeperApps()
  const navigate = useNavigate()
  const navigation = useAppNavigation()
  const byId = new Map(apps.map((app) => [app.id, app]))
  const rows = work.flatMap(({ appId, items }) => {
    const app = byId.get(appId)
    const modules = navigation.find((entry) => entry.appId === appId)?.modules ?? []
    return app
      ? items.map((item) => ({ app, item, icon: modules.find((module) => module.id === item.module) ?? app }))
      : []
  })
  if (rows.length === 0) return null

  return (
    <section aria-label="My work" data-tour="home-my-work" className="flex flex-col gap-2.5">
      <h2 className="px-1 text-[12px] font-medium uppercase tracking-[0.4px] text-kumo-inactive">My work</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map(({ app, item, icon }) => (
          <button
            key={`${app.id}:${item.id}`}
            type="button"
            onClick={() => navigate({ to: '/gatekeepers/$appId', params: { appId: app.id }, search: { at: item.route } })}
            {...preloadIntent(() => preloadAppRoute(app.id, item.route))}
            className="group press flex cursor-pointer items-center gap-3 rounded-xl border border-kumo-line bg-kumo-base px-3 py-2.5 text-left transition-colors hover:border-kumo-interact hover:bg-kumo-elevated"
          >
            <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-kumo-tint">
              <GatekeeperAppIcon app={icon} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13.5px] leading-5 tracking-[-0.2px] text-kumo-default">{item.title}</span>
              <span className="truncate text-[11.5px] leading-4 text-kumo-inactive">
                {[item.group ?? app.title, item.subtitle].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-kumo-brand/10 px-2 py-0.5 text-[12px] font-medium tabular-nums leading-4 text-kumo-brand">
              {item.count}
            </span>
            <ArrowRightIcon size={14} className="shrink-0 text-kumo-inactive opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </section>
  )
}
