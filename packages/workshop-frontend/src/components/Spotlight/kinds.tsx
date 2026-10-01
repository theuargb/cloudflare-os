import { ChartBarIcon, GearIcon, LightningIcon, ListBulletsIcon, PlusIcon, type Icon } from '@phosphor-icons/react'
import type { AppActionKind } from '@gadgets/workshop-shared/app-host'

type KindStyle = {
  /** The row tag, e.g. "Create". */
  tag: string
  /** The filter chip, e.g. "Journals". */
  filter: string
  Icon: Icon
  /** Tinted square behind the icon. */
  tile: string
  /** The tag pill. */
  pill: string
  /** Solid dot on the filter chip. */
  dot: string
}

/** The only place launcher colours live: apps send a kind, the host decides how it looks. */
export const ACTION_KINDS: Record<AppActionKind, KindStyle> = {
  create: {
    tag: 'Створити',
    filter: 'Створити',
    Icon: PlusIcon,
    tile: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  list: {
    tag: 'Журнал',
    filter: 'Журнали',
    Icon: ListBulletsIcon,
    tile: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
    dot: 'bg-sky-500',
    pill: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  },
  report: {
    tag: 'Звіт',
    filter: 'Звіти',
    Icon: ChartBarIcon,
    tile: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
    dot: 'bg-violet-500',
    pill: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  operation: {
    tag: 'Операція',
    filter: 'Операції',
    Icon: LightningIcon,
    tile: 'bg-amber-500/14 text-amber-600 dark:text-amber-400',
    dot: 'bg-amber-500',
    pill: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
  },
  settings: {
    tag: 'Налаштування',
    filter: 'Налаштування',
    Icon: GearIcon,
    tile: 'bg-kumo-fill text-kumo-subtle',
    dot: 'bg-stone-400',
    pill: 'bg-kumo-tint text-kumo-subtle',
  },
}

export const KIND_ORDER: AppActionKind[] = ['create', 'list', 'report', 'operation', 'settings']

/** The kind's icon on its tinted tile; `size` is the tile edge in px. */
export function KindTile({ kind, size = 28 }: { kind: AppActionKind; size?: number }) {
  const { Icon, tile } = ACTION_KINDS[kind]
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-lg ${tile}`}
      style={{ width: size, height: size }}
    >
      <Icon size={Math.round(size * 0.55)} weight="bold" />
    </span>
  )
}

export function KindPill({ kind }: { kind: AppActionKind }) {
  const { tag, pill } = ACTION_KINDS[kind]
  return <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-4 ${pill}`}>{tag}</span>
}
