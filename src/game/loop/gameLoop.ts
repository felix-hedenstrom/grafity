export interface GameLoopHandle {
  stop(): void
}

/**
 * Self-rescheduling via setTimeout rather than a fixed setInterval, so the
 * cadence can change between ticks (speed upgrades, momentum scaling with
 * steps taken) without tearing down and recreating the loop — getIntervalMs
 * is read fresh before every scheduled tick.
 */
export function startGameLoop(onTick: () => void, getIntervalMs: () => number): GameLoopHandle {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const schedule = () => {
    timeoutId = setTimeout(() => {
      if (stopped) return
      onTick()
      schedule()
    }, getIntervalMs())
  }
  schedule()

  return {
    stop: () => {
      stopped = true
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    },
  }
}
