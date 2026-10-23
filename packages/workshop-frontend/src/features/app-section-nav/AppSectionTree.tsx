import type { AppNavSection } from '@gadgets/workshop-shared/app-host'
import { KIND_ICONS } from './kindIcons'
import { useDesktop } from './sectionNavHooks'
import { selectAppSection, useAppSectionNav } from './sectionNavStore'

/**
 * The open app's sections nested under its active sidebar row, in the order the app publishes them:
 * in the expanded desktop rail and in the mobile drawer (the collapsed rail opens them in a hover
 * flyout, `AppSectionFlyout`). Filter chips stay in the page.
 */
export default function AppSectionTree({ appId, entry, drawer }: {
  appId: string
  /** The row's app entry: the tree shows only the navigation published on it. */
  entry?: { id: string; first: boolean }
  drawer: boolean
}) {
  const nav = useAppSectionNav(appId, entry)
  const desktop = useDesktop()
  // Both rail instances exist on every screen: show the one that is visible.
  if (!nav || drawer === desktop) return null

  return (
    <div
      role="navigation"
      aria-label="Sections"
      data-tour="section-nav"
      className="mb-1 ml-[19px] mt-0.5 border-l border-kumo-line pl-2"
    >
      <ul className="flex flex-col gap-0.5">
        {nav.sections.map((section) => (
          <li key={section.id}>
            <SectionRow appId={appId} active={nav.active} section={section} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** One section of the open app; `onSelect` runs after a section other than the current one is picked. */
export function SectionRow({ appId, active, section, onSelect }: {
  appId: string
  active: string
  section: AppNavSection
  onSelect?: () => void
}) {
  const current = section.id === active
  const KindIcon = section.kind && KIND_ICONS[section.kind]
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      onClick={() => {
        if (current) return
        selectAppSection(appId, section.id)
        onSelect?.()
      }}
      className={[
        'group flex h-11 w-full items-center gap-2 rounded-md px-2 text-left text-[14px] transition-colors md:h-7 md:text-[13px]',
        current ? 'bg-kumo-fill font-medium text-kumo-strong' : 'cursor-pointer text-kumo-default hover:bg-kumo-tint',
      ].join(' ')}
    >
      {KindIcon && (
        <KindIcon
          size={14}
          aria-hidden
          className={`shrink-0 transition-colors ${current ? 'text-kumo-brand' : 'text-kumo-subtle group-hover:text-kumo-default'}`}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{section.label}</span>
      {section.count !== undefined && (
        <span className={`shrink-0 text-[12px] tabular-nums ${current ? 'text-kumo-brand' : 'text-kumo-inactive'}`}>
          {section.count}
        </span>
      )}
    </button>
  )
}
