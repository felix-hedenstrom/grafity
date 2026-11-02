import { useMemo } from 'react'
import { computeGraphBounds } from '../../game/graph/layout'
import type { GraphBounds } from '../../game/graph/layout'
import { computeMinimapTransform, projectToMinimap } from '../../game/graph/minimap'
import type { Graph, NodeId } from '../../game/graph/types'
import styles from './Minimap.module.css'

const PANEL_WIDTH = 150
const PANEL_HEIGHT = 110
const PADDING = 8
const SVG_WIDTH = PANEL_WIDTH - PADDING * 2
const SVG_HEIGHT = PANEL_HEIGHT - PADDING * 2

interface MinimapProps {
  graph: Graph
  discoveredNodeIds: Set<NodeId>
  walkerPositions: { x: number; y: number }[]
  /** The main view's current camera window, in the same graph-space coordinates as node positions — drawn as a box so it's obvious what slice of the whole graph is actually on screen. */
  viewport: GraphBounds
}

/**
 * A small always-legible overview of the whole graph, shown only once the main view has had to
 * zoom into a windowed region of it (see computeViewBounds) — on a graph small enough to fit
 * entirely on screen already, this would just be a redundant, smaller copy of the same picture.
 */
export function Minimap({ graph, discoveredNodeIds, walkerPositions, viewport }: MinimapProps) {
  const fullBounds = useMemo(() => computeGraphBounds(graph), [graph])
  const transform = useMemo(() => computeMinimapTransform(fullBounds, SVG_WIDTH, SVG_HEIGHT), [fullBounds])

  const discoveredNodes = useMemo(() => graph.nodes.filter((n) => discoveredNodeIds.has(n.id)), [graph, discoveredNodeIds])

  const viewportTopLeft = projectToMinimap(viewport.minX, viewport.minY, fullBounds, transform)
  const viewportSize = { width: viewport.width * transform.scale, height: viewport.height * transform.scale }

  return (
    <div className={styles.panel}>
      <div className={styles.label}>Map</div>
      <svg
        className={styles.svg}
        width={SVG_WIDTH}
        height={SVG_HEIGHT}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        role="img"
        aria-label="Whole-graph overview"
      >
        {discoveredNodes.map((node) => {
          const p = projectToMinimap(node.x ?? 0, node.y ?? 0, fullBounds, transform)
          return <circle key={node.id} cx={p.x} cy={p.y} r={node.isGoal ? 2.5 : 1.4} className={node.isGoal ? styles.goalDot : styles.dot} />
        })}
        <rect
          x={viewportTopLeft.x}
          y={viewportTopLeft.y}
          width={viewportSize.width}
          height={viewportSize.height}
          className={styles.viewportBox}
        />
        {walkerPositions.map((pos, i) => {
          const p = projectToMinimap(pos.x, pos.y, fullBounds, transform)
          return <circle key={i} cx={p.x} cy={p.y} r={2.2} className={styles.walkerDot} />
        })}
      </svg>
    </div>
  )
}
