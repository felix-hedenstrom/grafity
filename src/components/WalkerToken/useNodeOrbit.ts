import { useLayoutEffect } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { orbitFrameAt } from './orbitMath'

/** Below this |velocity| (px/ms) the nose direction is numerically meaningless — the stationary
 * endpoints of the orbit — so the previous nose is held instead of reading atan2(0, 0). */
const SPEED_EPSILON = 1e-4

interface NodeOrbitArgs {
  /** Whether the timed orbit should be running right now — resting with a known wait, long
   * enough to be worth orbiting, and motion not reduced. The hook is inert while false. */
  active: boolean
  /** WalkerRest.startedAt — when the pause began (Date.now() domain). */
  startedAt: number | undefined
  /** WalkerRest.waitMs — the pause's full duration; the orbit is timed to fill it exactly. */
  waitMs: number | undefined
  /** Orbit cruise radius, px. */
  radius: number
  /** The .heading group whose transform the orbit owns while active. */
  headingEl: RefObject<SVGGElement | null>
  /** The component's live nose angle: read at activation as the spiral-out direction (the ship
   * drifts off along wherever its nose physically points — retrograde after a braking arrival),
   * and written back every frame so the departure unwrap turns ≤180° from the orbit's true
   * final heading. */
  unwrappedAngleRef: MutableRefObject<number>
}

/**
 * Drives the discovering orbit imperatively with requestAnimationFrame while a walker sits
 * through its discover wait: spiral out from the node center, cruise, spiral back to rest at
 * the center exactly as the wait ends (see orbitMath.ts for the curve). Imperative style writes
 * — not state — so the orbit doesn't re-render the component ~60×/sec, and so React's own
 * rendered transform (left undefined while the orbit is active) never fights it mid-frame.
 */
export function useNodeOrbit({ active, startedAt, waitMs, radius, headingEl, unwrappedAngleRef }: NodeOrbitArgs): void {
  useLayoutEffect(() => {
    if (!active || startedAt == null || waitMs == null) return
    const el = headingEl.current
    if (!el) return

    // The class's 220ms transform transition would smear every per-frame write into mush —
    // suspend it for exactly the orbit's lifetime (restored in cleanup, where it carries the
    // exit hand-off into the departure heading).
    el.style.transition = 'none'
    const entryNose = unwrappedAngleRef.current
    let lastNose = entryNose

    const writeFrame = () => {
      const t = Date.now() - startedAt
      const frame = orbitFrameAt(t, waitMs, radius, entryNose)
      // atan2's output only differs from lastNose by whole turns at the moment speed first
      // crosses the epsilon (both describe the same direction), so swapping to it is invisible.
      if (frame.speed >= SPEED_EPSILON) lastNose = frame.noseDeg
      unwrappedAngleRef.current = lastNose
      el.style.transform = `translate(${frame.x}px, ${frame.y}px) rotate(${lastNose}deg)`
    }

    // First frame synchronously in the same commit the orbit activates (layout effects run
    // before paint), so the frame where React dropped its own transform never reaches screen.
    writeFrame()
    let raf = requestAnimationFrame(function loop() {
      writeFrame()
      // Keep looping only while the rest is still running; after waitMs the curve has already
      // parked the ship at the center, and it just sits there until the departure prop arrives.
      if (Date.now() - startedAt < waitMs) raf = requestAnimationFrame(loop)
    })

    return () => {
      cancelAnimationFrame(raf)
      // Restore the transition but leave the transform wherever the last frame put it (radius
      // ~0, nose at lastNose) — React's commit for the departure heading lands in this same
      // task, and the restored transition animates from the last painted orbit frame to it.
      el.style.transition = ''
    }
    // unwrappedAngleRef/headingEl are stable refs; radius changes only with a new graph/scale,
    // which also replaces the rest itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, startedAt, waitMs, radius])
}
