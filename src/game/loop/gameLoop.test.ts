import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startGameLoop } from './gameLoop'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startGameLoop', () => {
  it('calls onTick repeatedly at the interval returned by getIntervalMs', () => {
    const onTick = vi.fn()
    const handle = startGameLoop(onTick, () => 1000)

    expect(onTick).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(onTick).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(3000)
    expect(onTick).toHaveBeenCalledTimes(4)

    handle.stop()
  })

  it('reads a fresh interval before every tick, so speed can change mid-run', () => {
    const onTick = vi.fn()
    let interval = 1000
    const handle = startGameLoop(onTick, () => interval)

    vi.advanceTimersByTime(1000) // tick 1 fires; the *next* timeout is scheduled here, still using interval=1000
    expect(onTick).toHaveBeenCalledTimes(1)

    interval = 100 // simulate a speed upgrade kicking in — too late to affect the already-scheduled next tick
    vi.advanceTimersByTime(1000) // tick 2 fires at the originally-scheduled 1000ms mark, then reschedules using the new interval
    expect(onTick).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(100) // tick 3 fires after only 100ms, proving the new interval is now in effect
    expect(onTick).toHaveBeenCalledTimes(3)

    handle.stop()
  })

  it('stop() halts further ticks', () => {
    const onTick = vi.fn()
    const handle = startGameLoop(onTick, () => 1000)

    vi.advanceTimersByTime(1000)
    expect(onTick).toHaveBeenCalledTimes(1)

    handle.stop()
    vi.advanceTimersByTime(10_000)
    expect(onTick).toHaveBeenCalledTimes(1)
  })
})
