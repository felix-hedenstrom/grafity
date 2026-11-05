import { useId, useMemo } from 'react'
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../game/scannerWiring/board'
import type { Sensor } from '../../game/scannerWiring/board'
import { resolveSwap } from '../../game/scannerWiring/wiring'
import { useAnimationNow } from '../../hooks/useAnimationNow'
import { useScannerWiringStore } from '../../store/useScannerWiringStore'
import { mulberry32 } from '../../utils/rng'
import styles from './ScannerArrayModal.module.css'

const MAX_SENSOR_RADIUS = 0.017
const BACKGROUND_STAR_COUNT = 70
const COMPACT_BACKGROUND_STAR_COUNT = 30

/** Faint decorative starfield behind the panel — fixed seed, so it never shimmers between renders. */
function useBackgroundStars(count: number): Sensor[] {
  return useMemo(() => {
    const rng = mulberry32(20261104)
    return Array.from({ length: count }, () => ({ x: rng() * BOARD_WIDTH, y: rng() * BOARD_HEIGHT }))
  }, [count])
}

/** Points string for an SVG polygon through the given visiting order. */
function pointsFor(order: readonly number[], sensors: readonly Sensor[]): string {
  return order.map((i) => `${sensors[i].x},${sensors[i].y}`).join(' ')
}

/** Ease that never quite stops — mostly linear with a soft settle, so the wires keep drifting across step boundaries instead of pausing. */
function drift(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  const smooth = clamped * clamped * (3 - 2 * clamped)
  return 0.6 * clamped + 0.4 * smooth
}

function lerp(a: Sensor, b: Sensor, t: number): Sensor {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/**
 * The live loop as one SVG path, with Darkly-bot's upcoming swap of wires i and j morphing in over
 * progress t: wire a→b slides its far end over to c while c→d slides its near end over to b, so at
 * t = 1 the picture is exactly the uncrossed loop (a→c, b→d) the bot is about to commit.
 */
function morphPaths(order: readonly number[], sensors: readonly Sensor[], move: { i: number; j: number } | null, t: number): { still: string; moving: string } {
  const n = order.length
  const at = (k: number) => sensors[order[k % n]]
  let still = ''
  let moving = ''
  for (let k = 0; k < n; k++) {
    let from = at(k)
    let to = at(k + 1)
    if (move && k === move.i) to = lerp(at(move.i + 1), at(move.j), t)
    else if (move && k === move.j) from = lerp(at(move.j), at(move.i + 1), t)
    else {
      still += `M${from.x},${from.y}L${to.x},${to.y}`
      continue
    }
    moving += `M${from.x},${from.y}L${to.x},${to.y}`
  }
  return { still, moving }
}

/**
 * The live wiring panel — sensors, the loop, and Darkly-bot's in-progress swap morphing in. Shared by
 * the Scanner Array modal and the always-visible HUD thumbnail; each copy animates on its own.
 * Compact mode drops the dashed reference loop and thins the starfield so a small board stays legible.
 */
export function ScannerBoard({ className, compact = false }: { className?: string; compact?: boolean }) {
  const sensors = useScannerWiringStore((s) => s.sensors)
  const order = useScannerWiringStore((s) => s.order)
  const referenceOrder = useScannerWiringStore((s) => s.referenceOrder)
  const stepStartedAt = useScannerWiringStore((s) => s.stepStartedAt)
  const stepDurationMs = useScannerWiringStore((s) => s.stepDurationMs)
  const pendingSwap = useScannerWiringStore((s) => s.pendingSwap)
  const stars = useBackgroundStars(compact ? COMPACT_BACKGROUND_STAR_COUNT : BACKGROUND_STAR_COUNT)
  // Unique per instance: the HUD board and the modal board are on screen together, and SVG filter ids are document-global.
  const glowId = `wire-glow-${useId().replace(/:/g, '')}`

  // The swap Darkly-bot locked in at the start of this step interval — animated across the whole interval, so the wiring is always in motion.
  // Re-located by sensor id each render, so a sensor spliced in mid-step shifts positions without changing the move.
  const move = useMemo(() => (pendingSwap === null ? null : resolveSwap(order, pendingSwap)), [order, pendingSwap])
  const now = useAnimationNow(pendingSwap !== null)
  const progress = stepDurationMs > 0 ? drift((now - stepStartedAt) / stepDurationMs) : 0
  const paths = morphPaths(order, sensors, move, progress)
  // Shrink sensors a little as the array fills up, so a big board stays legible.
  const sensorRadius = Math.min(MAX_SENSOR_RADIUS, 0.12 / Math.sqrt(sensors.length))
  const glow = `url(#${glowId})`

  return (
    <svg
      className={[styles.board, className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
      role="img"
      aria-label={`Scanner Array with ${sensors.length} sensors`}
    >
      <defs>
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.006" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {stars.map((star, i) => (
        <circle key={i} cx={star.x} cy={star.y} r={i % 7 === 0 ? 0.003 : 0.0018} className={styles.backgroundStar} />
      ))}

      {!compact && <polygon points={pointsFor(referenceOrder, sensors)} className={styles.ghostWire} />}
      <path d={paths.still} className={styles.wire} filter={glow} />
      {paths.moving && <path d={paths.moving} className={[styles.wire, styles.wireMoving].join(' ')} filter={glow} />}

      {sensors.map((sensor, i) => (
        <circle key={i} cx={sensor.x} cy={sensor.y} r={sensorRadius} className={[styles.sensor, styles.sensorWired].join(' ')} />
      ))}
    </svg>
  )
}
