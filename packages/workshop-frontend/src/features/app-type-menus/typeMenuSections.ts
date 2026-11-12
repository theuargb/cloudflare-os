import type { AppMenuKind } from '@gadgets/workshop-shared/app-host'
import { moduleSections, typeOf, type SpotlightSection } from '../../components/Spotlight/catalog'
import { RECENT_LIMIT, type SpotlightEntry } from '../../components/Spotlight/ranking'
import type { RecentEntry } from '../../components/Spotlight/recents'

/**
 * The blocks of one topbar type menu: the open module's actions of `type` (`openModule` is its
 * `moduleKey`; none when null), then the user's recent picks of that type outside it, then every
 * other module in sidebar order, grouped like Spotlight. Empty blocks are dropped.
 */
export function typeMenuSections(
  entries: SpotlightEntry[],
  type: AppMenuKind,
  openModule: string | null,
  recents: RecentEntry[],
): SpotlightSection[] {
  const typed = entries.filter((entry) => typeOf(entry) === type)
  const current = typed.filter((entry) => openModule !== null && entry.moduleKey === openModule)
  const rest = typed.filter((entry) => !current.includes(entry))
  const byId = new Map(rest.map((entry) => [entry.id, entry]))
  const recent = recents
    .flatMap((pick) => {
      const entry = byId.get(pick.id)
      return entry ? [{ ...entry, indices: [] }] : []
    })
    .slice(0, RECENT_LIMIT)
  const sections: SpotlightSection[] = [
    ...moduleSections(current),
    { id: 'recent', heading: 'Recent', groups: [{ title: '', items: recent }] },
    ...moduleSections(rest),
  ]
  return sections.filter((section) => section.groups.some((group) => group.items.length > 0))
}
