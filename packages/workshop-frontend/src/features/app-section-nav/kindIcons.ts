import {
  BookOpenIcon,
  ChartBarIcon,
  FileTextIcon,
  GearIcon,
  ListBulletsIcon,
  QuestionIcon,
  SquaresFourIcon,
  TableIcon,
  TagIcon,
  type Icon,
} from '@phosphor-icons/react'
import type { AppNavSectionKind } from '@gadgets/workshop-shared/app-host'

/** One line icon per screen kind, the same for every app: the sidebar tree rows and the topbar type menus. */
export const KIND_ICONS: Record<AppNavSectionKind, Icon> = {
  overview: SquaresFourIcon,
  documents: FileTextIcon,
  registers: TableIcon,
  journals: ListBulletsIcon,
  reports: ChartBarIcon,
  references: BookOpenIcon,
  classifiers: TagIcon,
  settings: GearIcon,
  instructions: QuestionIcon,
}
