import { beforeEach, describe, expect, it } from 'vitest'
import { useAchievementStore } from './useAchievementStore'

beforeEach(() => {
  useAchievementStore.setState({ unlockedIds: [], toastQueue: [] })
})

describe('useAchievementStore', () => {
  it('starts with nothing unlocked and no queued toasts', () => {
    const state = useAchievementStore.getState()
    expect(state.unlockedIds).toEqual([])
    expect(state.toastQueue).toEqual([])
  })

  it('unlockMany adds new ids and queues a toast for each', () => {
    useAchievementStore.getState().unlockMany(['first-solve', 'level-25'])

    const state = useAchievementStore.getState()
    expect(state.unlockedIds).toEqual(['first-solve', 'level-25'])
    expect(state.toastQueue).toEqual(['first-solve', 'level-25'])
  })

  it('never re-unlocks or re-queues an id already unlocked', () => {
    useAchievementStore.getState().unlockMany(['first-solve'])
    useAchievementStore.getState().dismissCurrentToast() // clear the queue, but keep it unlocked

    useAchievementStore.getState().unlockMany(['first-solve', 'level-25'])

    const state = useAchievementStore.getState()
    expect(state.unlockedIds).toEqual(['first-solve', 'level-25'])
    expect(state.toastQueue).toEqual(['level-25']) // first-solve wasn't re-queued
  })

  it('dismissCurrentToast pops the oldest queued toast, preserving order for the rest', () => {
    useAchievementStore.getState().unlockMany(['first-solve', 'level-25', 'level-100'])

    useAchievementStore.getState().dismissCurrentToast()

    expect(useAchievementStore.getState().toastQueue).toEqual(['level-25', 'level-100'])
  })

  it('is a no-op when dismissing with an empty queue', () => {
    useAchievementStore.getState().dismissCurrentToast()
    expect(useAchievementStore.getState().toastQueue).toEqual([])
  })

  it('resetAchievements clears every unlocked id and any queued toasts', () => {
    useAchievementStore.getState().unlockMany(['first-solve', 'level-25'])

    useAchievementStore.getState().resetAchievements()

    const state = useAchievementStore.getState()
    expect(state.unlockedIds).toEqual([])
    expect(state.toastQueue).toEqual([])
  })

  it('allows an achievement to be unlocked again after resetAchievements', () => {
    useAchievementStore.getState().unlockMany(['first-solve'])
    useAchievementStore.getState().resetAchievements()

    useAchievementStore.getState().unlockMany(['first-solve'])

    expect(useAchievementStore.getState().unlockedIds).toEqual(['first-solve'])
  })
})
