import type { AppMenuKind } from '@gadgets/workshop-shared/app-host'
import { typeOf } from '../../components/Spotlight/catalog'
import { useAppActionEntries } from '../../components/Spotlight/useAppActionEntries'
import { useOpenAppId } from '../app-section-nav/sectionNavHooks'
import { useAppSectionNav } from '../app-section-nav/sectionNavStore'
import TypeMenu from './TypeMenu'

const TYPE_MENUS: AppMenuKind[] = ['documents', 'registers', 'reports']

/**
 * The topbar type menus between «АРМ» and «Меню» (≥ lg; mobile has none): one dropdown per menu kind
 * that has actions. The open module is the one its app's section navigation names.
 */
export default function AppTypeMenus() {
  const entries = useAppActionEntries()
  const appId = useOpenAppId()
  const nav = useAppSectionNav(appId)
  // Same key format as useAppActionEntries: `<appId>:<module id>`.
  const openModule = appId && nav ? `${appId}:${nav.module ?? ''}` : null
  const present = TYPE_MENUS.filter((type) => entries.some((entry) => typeOf(entry) === type))
  if (present.length === 0) return null

  return (
    <nav aria-label="Action types" data-tour="type-menus" className="hidden items-center gap-2 lg:flex">
      {present.map((type) => (
        <TypeMenu key={type} type={type} entries={entries} openModule={openModule} />
      ))}
    </nav>
  )
}
