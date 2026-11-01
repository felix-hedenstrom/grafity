import { useProgressionStore } from '../store/useProgressionStore'
import { useRunStore } from '../store/useRunStore'
import { startGameLoop } from './loop/gameLoop'
import type { GameLoopHandle } from './loop/gameLoop'
import { computeTickIntervalMs } from './speed/rules'

export function startGame(): GameLoopHandle {
  return startGameLoop(
    () => useRunStore.getState().tick(),
    () =>
      computeTickIntervalMs({
        quickStepsLevel: useProgressionStore.getState().quickStepsLevel,
        momentumLevel: useProgressionStore.getState().momentumLevel,
        elapsedSecondsThisRun: (Date.now() - useRunStore.getState().runStartedAt) / 1000,
      }),
  )
}
