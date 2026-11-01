import { useMemo } from 'react'
import { computeGraphBounds } from '../../game/graph/layout'
import { edgeId } from '../../game/graph/types'
import type { NodeId } from '../../game/graph/types'
import { getStrategy } from '../../game/strategies'
import type { HighlightKind } from '../../game/strategies'
import { computeEffectiveMemoryLevel } from '../../game/strategies/memory'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import { WalkerToken } from '../WalkerToken/WalkerToken'
import styles from './GraphView.module.css'

/** Which CSS class visualizes each kind of highlight group — shared across every strategy, since Node Memory now applies to all of them. */
const HIGHLIGHT_CLASS_BY_KIND: Record<HighlightKind, string> = {
  remembered: styles.inMemory,
  stack: styles.inStack,
  candidate: styles.bestCandidate,
  frontier: styles.frontier,
  path: styles.plannedPath,
}

/** A small, stable per-node hue-rotate offset so a sea of plain visited nodes reads as varied rather than flat gray, especially on big, mostly-explored graphs. */
function hueRotateForNode(nodeId: string): number {
  let hash = 0
  for (let i = 0; i < nodeId.length; i++) {
    hash = (hash * 31 + nodeId.charCodeAt(i)) | 0
  }
  return (Math.abs(hash) % 61) - 30 // -30..+30 degrees
}

export function GraphView() {
  const graph = useRunStore((s) => s.graph)
  const walker = useRunStore((s) => s.walker)
  const walker2 = useRunStore((s) => s.walker2)
  const discovery = useRunStore((s) => s.discovery)
  const status = useRunStore((s) => s.status)
  const strategyMemory = useRunStore((s) => s.strategyMemory)
  const activeStrategyId = useProgressionStore((s) => s.activeStrategyId)
  const memoryLevel = useProgressionStore((s) => s.memoryLevel)
  const deepMemoryLevel = useProgressionStore((s) => s.deepMemoryLevel)
  const effectiveMemoryLevel = computeEffectiveMemoryLevel(
    memoryLevel,
    deepMemoryLevel,
    getStrategy(activeStrategyId).memoryMultiplier,
  )

  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])
  // Bounds come from the whole graph (not just discovered nodes) and only
  // change when the graph itself changes, so the view never rescales as
  // fog lifts — it just shows more of a frame that was already fixed.
  const bounds = useMemo(() => computeGraphBounds(graph), [graph])

  const discoveredNodes = useMemo(
    () => graph.nodes.filter((n) => discovery.discoveredNodeIds.has(n.id)),
    [graph, discovery.discoveredNodeIds],
  )
  const discoveredEdges = useMemo(
    () => graph.edges.filter((e) => discovery.discoveredEdgeIds.has(e.id)),
    [graph, discovery.discoveredEdgeIds],
  )

  // The edges actually stepped across, not just "both endpoints happen to be visited" — with two
  // independent walkers sharing one visited set (Bidirectional Search), that looser check lit up
  // edges neither walker had ever crossed whenever their territories merely touched.
  const traveledEdgeIds = useMemo(() => {
    const ids = new Set<string>()
    const addPath = (path: NodeId[]) => {
      for (let i = 0; i < path.length - 1; i++) {
        ids.add(edgeId(path[i], path[i + 1]))
      }
    }
    addPath(walker.path)
    if (walker2) addPath(walker2.path)
    return ids
  }, [walker.path, walker2])

  // A node can only belong to one highlight kind at a time in practice (memory-filtered
  // candidates exclude remembered nodes before scoring), but groups are applied in array
  // order regardless, so a later group's class wins if a strategy ever returns an overlap.
  const highlightClassByNodeId = useMemo(() => {
    const strategy = getStrategy(activeStrategyId)
    const groups =
      strategy.getHighlightedNodes?.({ graph, discovery, walker, memory: strategyMemory, memoryLevel: effectiveMemoryLevel }) ?? []
    const map = new Map<NodeId, string>()
    for (const group of groups) {
      const className = HIGHLIGHT_CLASS_BY_KIND[group.kind]
      for (const nodeId of group.nodeIds) map.set(nodeId, className)
    }
    return map
  }, [activeStrategyId, graph, discovery, walker, strategyMemory, effectiveMemoryLevel])

  const walkerPosition = nodesById.get(walker.currentNodeId)
  const walker2Position = walker2 ? nodesById.get(walker2.currentNodeId) : undefined
  const isCelebrating = status === 'celebrating'

  return (
    <div className={styles.wrapper}>
      <svg
        className={styles.graph}
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
        role="img"
        aria-label="Graph exploration map"
      >
        <g>
          {discoveredEdges.map((edge) => {
            const source = nodesById.get(edge.source)
            const target = nodesById.get(edge.target)
            if (!source || !target) return null
            const traveled = traveledEdgeIds.has(edge.id)
            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                className={[styles.edge, traveled ? styles.traveledEdge : ''].filter(Boolean).join(' ')}
              />
            )
          })}
        </g>
        <g>
          {discoveredNodes.map((node) => {
            const isHighlighted = highlightClassByNodeId.has(node.id)
            const isCurrent = node.id === walker.currentNodeId || node.id === walker2?.currentNodeId
            const isPlainVisited = discovery.visitedNodeIds.has(node.id) && !node.isGoal && !node.isStart && !isCurrent && !isHighlighted

            return (
              <circle
                key={node.id}
                cx={node.x}
                cy={node.y}
                r={node.isGoal ? 14 : 10}
                style={isPlainVisited ? { filter: `hue-rotate(${hueRotateForNode(node.id)}deg)` } : undefined}
                className={[
                  styles.node,
                  discovery.visitedNodeIds.has(node.id) ? styles.visited : '',
                  node.isGoal ? styles.goal : '',
                  node.isStart ? styles.start : '',
                  isCurrent ? styles.currentNode : '',
                  highlightClassByNodeId.get(node.id) ?? '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            )
          })}
        </g>
        {walkerPosition && <WalkerToken x={walkerPosition.x ?? 0} y={walkerPosition.y ?? 0} />}
        {walker2Position && <WalkerToken x={walker2Position.x ?? 0} y={walker2Position.y ?? 0} variant="reverse" />}
        {isCelebrating && walkerPosition && (
          <g>
            <circle cx={walkerPosition.x} cy={walkerPosition.y} className={styles.burstRing} style={{ animationDelay: '0ms' }} />
            <circle cx={walkerPosition.x} cy={walkerPosition.y} className={styles.burstRing} style={{ animationDelay: '180ms' }} />
            <circle cx={walkerPosition.x} cy={walkerPosition.y} className={styles.burstRing} style={{ animationDelay: '360ms' }} />
          </g>
        )}
      </svg>
      {isCelebrating && <div className={styles.banner}>Exit found!</div>}
    </div>
  )
}
