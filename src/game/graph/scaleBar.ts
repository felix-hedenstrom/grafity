import { PRODUCTION_CONFIG } from '../config/production'

/**
 * Map-scale-bar math. The camera is deliberately scale-invariant across levels (see layout.ts's
 * viewScale), so without a scale bar nothing on screen shows that node spacing keeps growing.
 *
 * Distances are shown in light-time, anchored to the game's own speed of light: c is
 * `speed.baseSpeedOfLight` world units per second, so one world unit is 1/c light-seconds. That
 * keeps the bar honest against the FTL/c mechanic — "2 lmin" is literally how long light takes.
 */

/** Light-time units, smallest first, with their length in light-seconds. */
const LIGHT_UNITS = [
  { unit: 'ls', seconds: 1 },
  { unit: 'lmin', seconds: 60 },
  { unit: 'lh', seconds: 3600 },
  { unit: 'ld', seconds: 86400 },
  { unit: 'ly', seconds: 31_557_600 },
] as const

export function worldUnitsToLightSeconds(units: number, speedOfLight = PRODUCTION_CONFIG.speed.baseSpeedOfLight): number {
  return units / speedOfLight
}

/** Picks the largest light-time unit the distance is at least 1 of (falling back to ls below 1 ls). */
export function formatLightDistance(lightSeconds: number): { value: number; unit: string } {
  let chosen: (typeof LIGHT_UNITS)[number] = LIGHT_UNITS[0]
  for (const candidate of LIGHT_UNITS) {
    if (lightSeconds >= candidate.seconds) chosen = candidate
  }
  return { value: lightSeconds / chosen.seconds, unit: chosen.unit }
}

/**
 * A fixed-length scale bar: the ruler always spans `pixelLength` on screen, and the label reads
 * how much light-time that span covers, to two decimals (e.g. "1.37 lmin") — so zooming and
 * spacing growth move the number, never the ruler.
 */
export function fixedScaleBar(
  worldPerPixel: number,
  pixelLength = 100,
  speedOfLight = PRODUCTION_CONFIG.speed.baseSpeedOfLight,
): { label: string; pixelLength: number } | null {
  if (!(worldPerPixel > 0) || !Number.isFinite(worldPerPixel)) return null
  const { value, unit } = formatLightDistance(worldUnitsToLightSeconds(worldPerPixel * pixelLength, speedOfLight))
  return { label: `${value.toFixed(2)} ${unit}`, pixelLength }
}

/** Percent change in node spacing between two graphs, e.g. 38 for a 1.38× jump. */
export function scaleChangePercent(prevSpacing: number, nextSpacing: number): number {
  if (!(prevSpacing > 0)) return 0
  return (nextSpacing / prevSpacing - 1) * 100
}
