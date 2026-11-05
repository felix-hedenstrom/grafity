import { startDarklyBotScheduler } from './loop/darklyBotScheduler'
import { startWalkerScheduler } from './loop/walkerScheduler'
import type { GameLoopHandle } from './loop/walkerScheduler'

let current: GameLoopHandle | null = null

function startInternal(): void {
  const walkers = startWalkerScheduler()
  const darklyBot = startDarklyBotScheduler()
  current = {
    stop: () => {
      walkers.stop()
      darklyBot.stop()
    },
  }
}

export function startGame(): GameLoopHandle {
  startInternal()
  return { stop: () => current?.stop() }
}

/** Halts the scheduler for good (no restart) — used by the gamestate import right before it overwrites the localStorage saves and reloads, so no in-flight walker timer can fire in the gap before the reload lands and re-persist the old state over the imported keys. */
export function stopGame(): void {
  current?.stop()
  current = null
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    current?.stop()
    startInternal()
  })
  import.meta.hot.dispose(() => {
    current?.stop()
  })
}
