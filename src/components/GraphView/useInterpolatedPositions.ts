import { useEffect, useRef, useState } from 'react'
import type { GraphNode, NodeId } from '../../game/graph/types'
import type { WalkerTransit } from '../../store/useRunStore'

export interface WalkerPositionInput {
  currentNodeId: NodeId
  transit: WalkerTransit | null
}

/** Matches WalkerToken.module.css's `.position` transition-timing-function, so the point this
 * computes tracks what's actually on screen rather than drifting from a differently-shaped curve. */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

function nodePos(id: NodeId, nodesById: Map<NodeId, GraphNode>): { x: number; y: number } {
  const node = nodesById.get(id)
  return { x: node?.x ?? 0, y: node?.y ?? 0 }
}

/**
 * Continuously-updating (x, y) per walker, driven by the same travelMs/startedAt timing that
 * already drives WalkerToken's CSS glide between nodes. Without this, callers that need a
 * walker's position (notably the camera) only had `currentNodeId`, which snaps the instant a
 * walker arrives at a node — frozen on the node it just left for the whole hop, then jumping on
 * arrival — even though the walker is visibly gliding across the edge the entire time.
 */
export function useInterpolatedPositions(inputs: WalkerPositionInput[], nodesById: Map<NodeId, GraphNode>): { x: number; y: number }[] {
  const computeAll = () =>
    inputs.map(({ currentNodeId, transit }) => {
      const from = nodePos(currentNodeId, nodesById)
      if (!transit) return from
      const to = nodePos(transit.nextNodeId, nodesById)
      const t = Math.min(1, (Date.now() - transit.startedAt) / transit.travelMs)
      const eased = easeInOut(t)
      return { x: lerp(from.x, to.x, eased), y: lerp(from.y, to.y, eased) }
    })

  const [positions, setPositions] = useState(computeAll)
  const latest = useRef(computeAll)
  latest.current = computeAll

  const hasActiveTransit = inputs.some((input) => input.transit !== null)

  useEffect(() => {
    setPositions(latest.current())
    if (!hasActiveTransit) return

    let rafId: number
    const step = () => {
      setPositions(latest.current())
      rafId = requestAnimationFrame(step)
    }
    rafId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs, nodesById, hasActiveTransit])

  return positions
}
