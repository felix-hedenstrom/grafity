import type { GameConfig } from './types'

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeInto(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue
    const existing = result[key]
    result[key] = isPlainObject(existing) && isPlainObject(value) ? mergeInto(existing, value) : value
  }
  return result
}

/**
 * A full GameConfig from a base plus a deep-partial override: overridden leaves replace, untouched
 * siblings and groups come through from the base unchanged. How the sim CLI turns a small JSON
 * tweak file into a runnable config without restating every production value.
 */
export function mergeConfig(base: GameConfig, override: DeepPartial<GameConfig>): GameConfig {
  return mergeInto(base as unknown as Record<string, unknown>, override as Record<string, unknown>) as unknown as GameConfig
}
