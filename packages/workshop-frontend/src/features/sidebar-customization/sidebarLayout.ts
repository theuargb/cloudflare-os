// Per-user sidebar customization: item order, group membership/order and label overrides.
// Pure model. Keys: items `builtin:<id>` / `app:<id>`; containers `main` / `group:<module group title>`.

export const MAIN_CONTAINER = 'main'
export const MAX_SIDEBAR_LABEL_LENGTH = 60

export type SidebarLayout = {
  /** Saved group order (container keys). */
  groups: string[]
  /** Saved item order per container. */
  items: Record<string, string[]>
  /** Label overrides keyed by item key or group container key. */
  labels: Record<string, string>
}

export type SidebarStructure = {
  main: string[]
  groups: { key: string; items: string[] }[]
}

export const EMPTY_SIDEBAR_LAYOUT: SidebarLayout = { groups: [], items: {}, labels: {} }

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string')

export const parseSidebarLayout = (raw: string | null): SidebarLayout => {
  if (raw === null) return EMPTY_SIDEBAR_LAYOUT
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return EMPTY_SIDEBAR_LAYOUT
  }
  if (typeof parsed !== 'object' || parsed === null) return EMPTY_SIDEBAR_LAYOUT
  const { groups, items, labels } = parsed as Record<string, unknown>
  const validItems: Record<string, string[]> = {}
  if (typeof items === 'object' && items !== null && !Array.isArray(items)) {
    for (const [container, keys] of Object.entries(items)) {
      if (isStringArray(keys)) validItems[container] = keys
    }
  }
  const validLabels: Record<string, string> = {}
  if (typeof labels === 'object' && labels !== null && !Array.isArray(labels)) {
    for (const [key, label] of Object.entries(labels)) {
      if (typeof label === 'string') validLabels[key] = label
    }
  }
  return { groups: isStringArray(groups) ? groups : [], items: validItems, labels: validLabels }
}

const storageKey = (userId: string) => `workshop.sidebar.layout:${userId}`

export const readSidebarLayout = (userId: string): SidebarLayout => {
  try {
    return parseSidebarLayout(localStorage.getItem(storageKey(userId)))
  } catch {
    return EMPTY_SIDEBAR_LAYOUT
  }
}

export const writeSidebarLayout = (userId: string, layout: SidebarLayout): void => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(layout))
  } catch {
    // Storage disabled or full: the customization simply does not persist.
  }
}

const unique = (keys: string[]): string[] => [...new Set(keys)]

/** Applies saved customization on top of the default structure. */
export const resolveSidebar = (defaults: SidebarStructure, layout: SidebarLayout): SidebarStructure => {
  const defaultGroupKeys = defaults.groups.map((group) => group.key)
  const groupOrder = [
    ...unique(layout.groups.filter((key) => defaultGroupKeys.includes(key))),
    ...defaultGroupKeys.filter((key) => !layout.groups.includes(key)),
  ]

  const containers = [MAIN_CONTAINER, ...defaultGroupKeys]
  const defaultOrder: { container: string; key: string }[] = [
    ...defaults.main.map((key) => ({ container: MAIN_CONTAINER, key })),
    ...defaults.groups.flatMap((group) => group.items.map((key) => ({ container: group.key, key }))),
  ]
  const known = new Set(defaultOrder.map((entry) => entry.key))

  const assigned = new Map<string, string>()
  for (const [container, keys] of Object.entries(layout.items)) {
    if (!containers.includes(container)) continue
    for (const key of keys) {
      if (known.has(key) && !assigned.has(key)) assigned.set(key, container)
    }
  }
  for (const { container, key } of defaultOrder) {
    if (!assigned.has(key)) assigned.set(key, container)
  }

  const order = (container: string): string[] => {
    const saved = unique((layout.items[container] ?? []).filter((key) => assigned.get(key) === container))
    const rest = defaultOrder
      .filter((entry) => assigned.get(entry.key) === container && !saved.includes(entry.key))
      .map((entry) => entry.key)
    return [...saved, ...rest]
  }

  return {
    main: order(MAIN_CONTAINER),
    groups: groupOrder.map((key) => ({ key, items: order(key) })),
  }
}

const allKeys = (resolved: SidebarStructure): Set<string> =>
  new Set([...resolved.main, ...resolved.groups.flatMap((group) => group.items)])

/** Moves an item into `container`, before `beforeKey` (end when null / not found). */
export const moveSidebarItem = (
  layout: SidebarLayout,
  resolved: SidebarStructure,
  itemKey: string,
  container: string,
  beforeKey: string | null,
): SidebarLayout => {
  if (itemKey === beforeKey) return layout
  const next = new Map<string, string[]>([
    [MAIN_CONTAINER, resolved.main],
    ...resolved.groups.map((group): [string, string[]] => [group.key, group.items]),
  ])
  for (const [key, items] of next) next.set(key, items.filter((item) => item !== itemKey))
  const target = next.get(container)
  if (!target) return layout
  const index = beforeKey === null ? -1 : target.indexOf(beforeKey)
  if (index === -1) target.push(itemKey)
  else target.splice(index, 0, itemKey)

  // Saved keys of apps absent from this render (RPC not loaded, disconnected) keep their placement.
  const present = allKeys(resolved)
  const items = { ...layout.items }
  for (const [key, order] of next) {
    const absent = (layout.items[key] ?? []).filter((saved) => !present.has(saved))
    items[key] = [...order, ...absent]
  }
  return { ...layout, items }
}

/** Moves a group before `beforeGroupKey` (end when null / not found). */
export const moveSidebarGroup = (
  layout: SidebarLayout,
  resolved: SidebarStructure,
  groupKey: string,
  beforeGroupKey: string | null,
): SidebarLayout => {
  if (groupKey === beforeGroupKey) return layout
  const order = resolved.groups.map((group) => group.key).filter((key) => key !== groupKey)
  const index = beforeGroupKey === null ? -1 : order.indexOf(beforeGroupKey)
  if (index === -1) order.push(groupKey)
  else order.splice(index, 0, groupKey)
  const known = new Set(order)
  return { ...layout, groups: [...order, ...layout.groups.filter((key) => !known.has(key))] }
}

export const setSidebarLabel = (
  layout: SidebarLayout,
  key: string,
  label: string,
  defaultLabel: string,
): SidebarLayout => {
  const trimmed = label.trim().slice(0, MAX_SIDEBAR_LABEL_LENGTH)
  const labels = { ...layout.labels }
  if (trimmed === '' || trimmed === defaultLabel) delete labels[key]
  else labels[key] = trimmed
  return { ...layout, labels }
}
