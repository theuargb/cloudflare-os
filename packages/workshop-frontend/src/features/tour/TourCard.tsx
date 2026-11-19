import type { Ref } from 'react'
import { Button } from '@cloudflare/kumo'
import { XIcon } from '@phosphor-icons/react'
import type { TourStep } from '@gadgets/workshop-shared/tour'

type TourCardProps = {
  step: TourStep
  /** 1-based position among the steps that are on screen. */
  position: number
  total: number
  onNext: () => void
  onBack: () => void
  onClose: () => void
  primaryRef: Ref<HTMLButtonElement>
  titleId: string
  bodyId: string
}

/** The content of a tour card: counter, close, text, progress dots and navigation. */
export default function TourCard({ step, position, total, onNext, onBack, onClose, primaryRef, titleId, bodyId }: TourCardProps) {
  const isFirst = position === 1
  const isLast = position === total
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium tabular-nums text-kumo-inactive">
          {`${position} of ${total}`}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tour"
          className="-mr-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-kumo-inactive transition-colors hover:bg-kumo-tint hover:text-kumo-default"
        >
          <XIcon size={14} />
        </button>
      </div>
      <div key={position} className="transition-opacity duration-200 starting:opacity-0 motion-reduce:transition-none">
        <h2 id={titleId} className="mt-1.5 text-[15px] font-semibold leading-5 tracking-[-0.2px] text-kumo-default">
          {step.title}
        </h2>
        <p id={bodyId} className="mt-1.5 text-[13px] leading-5 text-kumo-subtle">
          {step.body}
        </p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1" aria-hidden="true">
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none ${
                index === position - 1 ? 'w-4 bg-kumo-brand' : 'w-1.5 bg-kumo-line'
              }`}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {isFirst ? (
            <Button variant="secondary" size="sm" onClick={onClose}>
              Skip
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={onBack}>
              Back
            </Button>
          )}
          <Button ref={primaryRef} variant="primary" size="sm" onClick={onNext}>
            {isLast ? 'Done' : 'Next'}
          </Button>
        </div>
      </div>
    </>
  )
}
