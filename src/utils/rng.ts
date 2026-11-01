export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive)
}

export function pickRandom<T>(rng: Rng, items: readonly T[]): T {
  return items[randomInt(rng, items.length)]
}
