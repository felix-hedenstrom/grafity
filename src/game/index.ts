import { startWalkerScheduler } from './loop/walkerScheduler'
import type { GameLoopHandle } from './loop/walkerScheduler'

export function startGame(): GameLoopHandle {
  return startWalkerScheduler()
}
