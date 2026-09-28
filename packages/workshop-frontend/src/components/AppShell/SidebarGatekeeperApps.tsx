import { useState } from 'react'
import { BookOpen } from '@phosphor-icons/react'
import type { GatekeeperAppInfo } from '@gadgets/workshop-shared/api'
import SidebarItem from './SidebarItem'
import { SidebarSection } from './SidebarWorkspaces'

const CLOSED_GROUPS_KEY = 'workshop.sidebar.closedAppGroups'

function readClosedGroups(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CLOSED_GROUPS_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

/** One gatekeeper management app row; the (monochrome) icon is a CSS mask tinted like Phosphor icons. */
export function GatekeeperAppItem({ app, collapsed }: { app: GatekeeperAppInfo; collapsed: boolean }) {
  // Escape the icon URL for safe interpolation into a CSS url("…") string.
  const maskUrl = app.icon ? `url("${app.icon.url.replace(/[\\"]/g, '\\$&')}")` : undefined
  return (
    <SidebarItem
      to="/gatekeepers/$appId"
      params={{ appId: app.id }}
      label={app.title}
      icon={
        maskUrl ? (
          <span
            aria-hidden
            className="h-3.5 w-3.5 bg-current"
            style={{
              maskImage: maskUrl,
              WebkitMaskImage: maskUrl,
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
              maskPosition: 'center',
              WebkitMaskPosition: 'center',
              maskSize: 'contain',
              WebkitMaskSize: 'contain',
            }}
          />
        ) : (
          <BookOpen size={14} weight="regular" />
        )
      }
      collapsed={collapsed}
    />
  )
}

/**
 * Apps that declare `providesUi.group` render under one collapsible section per group, in the
 * order the groups first appear. Open/closed state persists per browser. In the collapsed (icon)
 * rail sections have no room for headers, so grouped apps render as a flat icon list.
 */
export function SidebarAppGroups({ apps, collapsed }: { apps: GatekeeperAppInfo[]; collapsed: boolean }) {
  const [closed, setClosed] = useState(readClosedGroups)
  const groups: { title: string; apps: GatekeeperAppInfo[] }[] = []
  for (const app of apps) {
    if (!app.group) continue
    const existing = groups.find((group) => group.title === app.group)
    if (existing) existing.apps.push(app)
    else groups.push({ title: app.group, apps: [app] })
  }
  if (groups.length === 0) return null

  if (collapsed) {
    return (
      <nav aria-label="Modules" className="flex flex-col gap-0.5 px-2 pt-2">
        {groups.flatMap((group) => group.apps).map((app) => (
          <GatekeeperAppItem key={app.id} app={app} collapsed />
        ))}
      </nav>
    )
  }

  const toggle = (title: string) => {
    const next = closed.includes(title) ? closed.filter((item) => item !== title) : [...closed, title]
    setClosed(next)
    localStorage.setItem(CLOSED_GROUPS_KEY, JSON.stringify(next))
  }

  return (
    <nav aria-label="Modules" className="flex flex-col">
      {groups.map((group) => (
        <SidebarSection
          key={group.title}
          label={group.title}
          count={group.apps.length}
          open={!closed.includes(group.title)}
          onToggle={() => toggle(group.title)}
        >
          <div className="flex flex-col gap-0.5">
            {group.apps.map((app) => (
              <GatekeeperAppItem key={app.id} app={app} collapsed={false} />
            ))}
          </div>
        </SidebarSection>
      ))}
    </nav>
  )
}
