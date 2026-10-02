import { useRef, type KeyboardEvent } from 'react'
import { MAX_SIDEBAR_LABEL_LENGTH } from './sidebarLayout'

export const SidebarLabelEditor = ({
  initialValue,
  defaultLabel,
  onCommit,
  onCancel,
}: {
  initialValue: string
  defaultLabel: string
  onCommit: (label: string) => void
  onCancel: () => void
}) => {
  // Enter/Escape unmount the input, which fires blur; the guard keeps that from committing twice.
  const done = useRef(false)
  const finish = (action: () => void) => {
    if (done.current) return
    done.current = true
    action()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') finish(() => onCommit(event.currentTarget.value))
    else if (event.key === 'Escape') finish(onCancel)
  }

  return (
    <input
      autoFocus
      defaultValue={initialValue}
      maxLength={MAX_SIDEBAR_LABEL_LENGTH}
      placeholder={defaultLabel}
      aria-label="Menu item name"
      title="Leave empty to restore the default name"
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={onKeyDown}
      onBlur={(event) => finish(() => onCommit(event.currentTarget.value))}
      className="min-w-0 flex-1 bg-transparent text-[14px] leading-5 normal-case tracking-normal text-kumo-strong outline-none md:text-[13px] md:leading-[18px]"
    />
  )
}
