import { useRef, useState, type DragEvent, type HTMLAttributes } from 'react'
import { MAIN_CONTAINER, type SidebarStructure } from './sidebarLayout'

type Source = { kind: 'item' | 'group'; key: string }
type Target =
  | { kind: 'item'; container: string; beforeKey: string | null }
  | { kind: 'group'; beforeGroupKey: string | null }

/** Always the top edge of the element the dragged one lands before, or the bottom of the last one. */
export type DropIndicator = { key: string; edge: 'top' | 'bottom' }

const DRAG_MIME = 'application/x-workshop-sidebar'
export const ROW_ATTRIBUTE = 'data-sidebar-row'

/** First element (other than the dragged one) whose vertical midpoint is below the pointer. */
const firstBelow = (elements: HTMLElement[], clientY: number): HTMLElement | null =>
  elements.find((element) => {
    const rect = element.getBoundingClientRect()
    return clientY < rect.top + rect.height / 2
  }) ?? null

/**
 * Native drag-and-drop state for the sidebar. The drop position is derived from the pointer against
 * the container's rows (not from the row under the pointer), so gaps and padding behave like rows
 * and each insertion point has exactly one indicator. Positions that would not change the order
 * produce no target and no indicator. The drag source lives in a ref because `dataTransfer` is
 * unreadable during `dragover`.
 */
export const useSidebarDrag = (
  resolved: SidebarStructure,
  onMoveItem: (itemKey: string, container: string, beforeKey: string | null) => void,
  onMoveGroup: (groupKey: string, beforeGroupKey: string | null) => void,
) => {
  const source = useRef<Source | null>(null)
  const targetRef = useRef<Target | null>(null)
  const [indicator, setIndicator] = useState<DropIndicator | null>(null)
  const [dropContainer, setDropContainer] = useState<string | null>(null)

  const itemsOf = (container: string): string[] =>
    container === MAIN_CONTAINER
      ? resolved.main
      : (resolved.groups.find((group) => group.key === container)?.items ?? [])

  const setTarget = (target: Target | null, next: DropIndicator | null, container: string | null) => {
    targetRef.current = target
    setIndicator((prev) => (prev?.key === next?.key && prev?.edge === next?.edge ? prev : next))
    setDropContainer(container)
  }

  const clear = () => {
    source.current = null
    setTarget(null, null, null)
  }

  const start = (kind: Source['kind'], key: string) => (event: DragEvent<HTMLElement>) => {
    event.stopPropagation()
    source.current = { kind, key }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DRAG_MIME, key)
  }

  const drop = (event: DragEvent<HTMLElement>) => {
    const dragged = source.current
    if (!dragged) return
    // Always cancel: an uncancelled drop of a link would navigate the page to it.
    event.preventDefault()
    event.stopPropagation()
    const target = targetRef.current
    if (dragged.kind === 'item' && target?.kind === 'item') {
      onMoveItem(dragged.key, target.container, target.beforeKey)
    } else if (dragged.kind === 'group' && target?.kind === 'group') {
      onMoveGroup(dragged.key, target.beforeGroupKey)
    }
    clear()
  }

  const overItemContainer = (event: DragEvent<HTMLElement>, container: string, dragged: string) => {
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>(`[${ROW_ATTRIBUTE}]`)].filter(
      (row) => row.getAttribute(ROW_ATTRIBUTE) !== dragged,
    )
    const below = firstBelow(rows, event.clientY)
    const beforeKey = below?.getAttribute(ROW_ATTRIBUTE) ?? null

    const items = itemsOf(container)
    const index = items.indexOf(dragged)
    if (index !== -1 && (items[index + 1] ?? null) === beforeKey) {
      setTarget(null, null, null)
      return
    }
    const last = rows[rows.length - 1]?.getAttribute(ROW_ATTRIBUTE)
    const next: DropIndicator | null = beforeKey
      ? { key: beforeKey, edge: 'top' }
      : last
        ? { key: last, edge: 'bottom' }
        : null
    setTarget({ kind: 'item', container, beforeKey }, next, next ? null : container)
  }

  const overGroup = (event: DragEvent<HTMLElement>, groupKey: string, dragged: string) => {
    const order = resolved.groups.map((group) => group.key)
    const rect = event.currentTarget.getBoundingClientRect()
    const edge = event.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom'
    const beforeGroupKey = edge === 'top' ? groupKey : (order[order.indexOf(groupKey) + 1] ?? null)
    const index = order.indexOf(dragged)
    if (beforeGroupKey === dragged || (index !== -1 && (order[index + 1] ?? null) === beforeGroupKey)) {
      setTarget(null, null, null)
      return
    }
    const next: DropIndicator = beforeGroupKey
      ? { key: beforeGroupKey, edge: 'top' }
      : { key: groupKey, edge: 'bottom' }
    setTarget({ kind: 'group', beforeGroupKey }, next, null)
  }

  /** Attributes for a draggable row wrapper. */
  const rowProps = (itemKey: string): HTMLAttributes<HTMLDivElement> & { [ROW_ATTRIBUTE]: string } => ({
    [ROW_ATTRIBUTE]: itemKey,
    onDragStart: start('item', itemKey),
    onDragEnd: clear,
  })

  /** Drop zone for a list of rows: the main nav or one group section. */
  const containerProps = (container: string): HTMLAttributes<HTMLElement> => ({
    onDrop: drop,
    onDragOver: (event) => {
      const dragged = source.current
      if (!dragged) return
      if (dragged.kind === 'item') {
        event.preventDefault()
        overItemContainer(event, container, dragged.key)
      } else if (container !== MAIN_CONTAINER) {
        event.preventDefault()
        overGroup(event, container, dragged.key)
      }
    },
  })

  const groupHandleProps = (groupKey: string): HTMLAttributes<HTMLDivElement> => ({
    draggable: true,
    onDragStart: start('group', groupKey),
    onDragEnd: clear,
  })

  return { dropIndicator: indicator, dropContainer, rowProps, containerProps, groupHandleProps }
}
