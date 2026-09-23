import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRateLimitedCapability } from './rateLimitedCapability'

const options = (overrides: Partial<Parameters<typeof createRateLimitedCapability>[1]> = {}) => ({
  maxConcurrency: 1,
  maxCallsPerMinute: 10,
  maxPendingCalls: 10,
  onRateLimit: 'throttle' as const,
  label: 'Gatekeeper app',
  ...overrides,
})

type DeferredDisposable<T> = {
  then: (resolve: (value: T) => void, reject?: (reason: unknown) => void) => void
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  [Symbol.dispose]: () => void
}

const deferredDisposable = <T>(dispose: () => void = vi.fn()): DeferredDisposable<T> => {
  let resolveHandler: ((value: T) => void) | undefined
  let rejectHandler: ((reason: unknown) => void) | undefined
  let settled = false
  let settledValue: T | undefined
  let settledReason: unknown
  let rejected = false
  const result: DeferredDisposable<T> = {
    then(onResolve, onReject) {
      resolveHandler = onResolve
      rejectHandler = onReject
      if (settled) {
        if (rejected) onReject?.(settledReason)
        else onResolve(settledValue as T)
      }
    },
    resolve: value => {
      if (!settled) {
        settled = true
        settledValue = value
        resolveHandler?.(value)
      }
    },
    reject: reason => {
      if (!settled) {
        settled = true
        rejected = true
        settledReason = reason
        rejectHandler?.(reason)
      }
    },
    [Symbol.dispose]: dispose,
  }
  return result
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createRateLimitedCapability disposal', () => {
  it('rejects queued work at disposal and leaves the active call able to resolve', async () => {
    let resolveActive!: (value: string) => void
    const target = {
      load: vi.fn(() => new Promise<string>(resolve => { resolveActive = resolve })),
    }
    const { capability, dispose } = createRateLimitedCapability(target, options())

    const active = capability.load()
    await Promise.resolve()
    const queued = capability.load()
    dispose()

    await expect(queued).rejects.toThrow('Gatekeeper app capability has been disposed.')
    resolveActive('loaded')
    await expect(active).resolves.toBe('loaded')
    expect(target.load).toHaveBeenCalledOnce()
  })

  it('rejects calls made after disposal without invoking the target', async () => {
    const target = { load: vi.fn(async () => 'loaded') }
    const { capability, dispose } = createRateLimitedCapability(target, options())
    dispose()

    await expect(capability.load()).rejects.toThrow('Gatekeeper app capability has been disposed.')
    expect(target.load).not.toHaveBeenCalled()
  })

  it('cancels a throttle resume timer and does not drain after disposal', async () => {
    vi.useFakeTimers()
    const target = { load: vi.fn(async () => 'loaded') }
    const { capability, dispose } = createRateLimitedCapability(target, options({
      maxCallsPerMinute: 1,
    }))

    await capability.load()
    const queued = capability.load()
    await Promise.resolve()
    dispose()
    dispose()

    await expect(queued).rejects.toThrow('Gatekeeper app capability has been disposed.')
    await vi.advanceTimersByTimeAsync(60_001)
    expect(target.load).toHaveBeenCalledOnce()
  })

  it('disposes every active disposable RPC result during rapid teardown', async () => {
    const firstDispose = vi.fn()
    const secondDispose = vi.fn()
    const first = deferredDisposable<string>(firstDispose)
    const second = deferredDisposable<string>(secondDispose)
    const target = {
      load: vi.fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second),
    }
    const { capability, dispose } = createRateLimitedCapability(target, options({
      maxConcurrency: 2,
    }))

    const firstCall = capability.load()
    const secondCall = capability.load()
    await Promise.resolve()
    dispose()

    expect(firstDispose).toHaveBeenCalledOnce()
    expect(secondDispose).toHaveBeenCalledOnce()
    first.resolve('first')
    second.resolve('second')
    await expect(firstCall).resolves.toBe('first')
    await expect(secondCall).resolves.toBe('second')
  })

  it('continues disposing active calls when one disposer throws and remains idempotent', async () => {
    const throwingDispose = vi.fn(() => { throw new Error('already closed') })
    const survivingDispose = vi.fn()
    const first = deferredDisposable<string>(throwingDispose)
    const second = deferredDisposable<string>(survivingDispose)
    const target = {
      load: vi.fn()
        .mockReturnValueOnce(first)
        .mockReturnValueOnce(second),
    }
    const { capability, dispose } = createRateLimitedCapability(target, options({
      maxConcurrency: 2,
    }))

    const firstCall = capability.load()
    const secondCall = capability.load()
    await Promise.resolve()
    expect(() => dispose()).not.toThrow()
    dispose()

    expect(throwingDispose).toHaveBeenCalledOnce()
    expect(survivingDispose).toHaveBeenCalledOnce()
    first.resolve('first')
    second.resolve('second')
    await expect(firstCall).resolves.toBe('first')
    await expect(secondCall).resolves.toBe('second')
  })

  it('does not dispose a result that settled before teardown', async () => {
    const resultDispose = vi.fn()
    const result = deferredDisposable<string>(resultDispose)
    const target = { load: vi.fn(() => result) }
    const { capability, dispose } = createRateLimitedCapability(target, options())

    const call = capability.load()
    await Promise.resolve()
    result.resolve('loaded')
    await expect(call).resolves.toBe('loaded')
    await Promise.resolve()
    dispose()

    expect(resultDispose).not.toHaveBeenCalled()
  })

  it('does not invoke a queued method after immediate disposal', async () => {
    const target = { load: vi.fn(async () => 'loaded') }
    const { capability, dispose } = createRateLimitedCapability(target, options())

    const call = capability.load()
    dispose()

    await expect(call).rejects.toThrow('Gatekeeper app capability has been disposed.')
    expect(target.load).not.toHaveBeenCalled()
  })

  it('disposes a raw result when disposal is re-entered by the target method', async () => {
    const resultDispose = vi.fn()
    const result = Object.assign(Promise.resolve('loaded'), {
      [Symbol.dispose]: resultDispose,
    })
    let dispose!: () => void
    const target = {
      load: vi.fn(() => {
        dispose()
        return result
      }),
    }
    const created = createRateLimitedCapability(target, options())
    dispose = created.dispose

    await expect(created.capability.load()).resolves.toBe('loaded')
    expect(target.load).toHaveBeenCalledOnce()
    expect(resultDispose).toHaveBeenCalledOnce()
  })
})
