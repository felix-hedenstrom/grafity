import { ACHIEVEMENTS } from './definitions'
import type { AchievementContext } from './types'

/** Returns the ids of every not-yet-unlocked achievement whose condition now holds, in definition order. */
export function evaluateAchievements(ctx: AchievementContext, unlockedIds: string[]): string[] {
  const alreadyUnlocked = new Set(unlockedIds)
  return ACHIEVEMENTS.filter((achievement) => !alreadyUnlocked.has(achievement.id) && achievement.check(ctx)).map((a) => a.id)
}
