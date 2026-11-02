import { useMemo } from 'react'
import { computeDynamicViewSize, computeGraphBounds, computeViewBounds } from '../../game/graph/layout'
import { edgeId } from '../../game/graph/types'
import type { NodeId } from '../../game/graph/types'
import { getStrategy } from '../../game/strategies'
import type { HighlightKind } from '../../game/strategies'
import { computeEffectiveMemoryLevel } from '../../game/strategies/memory'
import { MINIMAP_UPGRADE } from '../../game/upgrades/definitions'
import type { WalkerState } from '../../game/walker/types'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import { Minimap } from '../Minimap/Minimap'
import { WalkerToken } from '../WalkerToken/WalkerToken'
import styles from './GraphView.module.css'
import { useSmoothedBounds } from './useSmoothedBounds'

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
  const walkers = useRunStore((s) => s.walkers)
  const walker2 = useRunStore((s) => s.walker2)
  const walkerTransits = useRunStore((s) => s.walkerTransits)
  const walker2Transit = useRunStore((s) => s.walker2Transit)
  const discovery = useRunStore((s) => s.discovery)
  const status = useRunStore((s) => s.status)
  const redirectPath = useRunStore((s) => s.redirectPath)
  const strategyMemories = useRunStore((s) => s.strategyMemories)
  const sharedRecentPath = useRunStore((s) => s.sharedRecentPath)
  const activeStrategyId = useProgressionStore((s) => s.activeStrategyId)
  const memoryLevel = useProgressionStore((s) => s.memoryLevel)
  const deepMemoryLevel = useProgressionStore((s) => s.deepMemoryLevel)
  const minimapOwned = useProgressionStore((s) => s.purchasedUpgradeIds.includes(MINIMAP_UPGRADE.id))
  const minimapEnabled = useProgressionStore((s) => s.minimapEnabled)
  const effectiveMemoryLevel = computeEffectiveMemoryLevel(
    memoryLevel,
    deepMemoryLevel,
    getStrategy(activeStrategyId).memoryMultiplier,
  )

  // Every token on screen — every active searcher, plus Bidirectional's goal-side partner when present.
  const allWalkers = useMemo<WalkerState[]>(() => (walker2 ? [...walkers, walker2] : walkers), [walkers, walker2])

  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])

  // Bounds come from the whole graph (not just discovered nodes), so the view never rescales as
  // fog lifts — it just shows more of a frame that was already fixed. Below MAX_VIEW_SIZE that
  // frame is the whole graph, static for its lifetime; past it, node circles would shrink to
  // near-invisible dots if we kept fitting everything, so the view instead becomes a window
  // centered on the main walker (walkers[0]) — centering on the average of every walker's
  // position instead could land the camera on empty space between two widely spread-out walkers,
  // with neither actually on screen.
  const focus = useMemo(() => {
    const mainPos = walkers[0] ? nodesById.get(walkers[0].currentNodeId) : undefined
    return { x: mainPos?.x ?? 0, y: mainPos?.y ?? 0 }
  }, [walkers, nodesById])
  // Every other active walker, used only to size the window — not to move its center.
  const otherWalkerPositions = useMemo(
    () =>
      [...walkers.slice(1), ...(walker2 ? [walker2] : [])]
        .map((w) => nodesById.get(w.currentNodeId))
        .filter((p): p is NonNullable<typeof p> => p != null)
        .map((p) => ({ x: p.x ?? 0, y: p.y ?? 0 })),
    [walkers, walker2, nodesById],
  )
  const dynamicViewSize = useMemo(() => computeDynamicViewSize(focus, otherWalkerPositions), [focus, otherWalkerPositions])
  const targetBounds = useMemo(() => computeViewBounds(graph, focus.x, focus.y, dynamicViewSize), [graph, focus, dynamicViewSize])
  // Smoothly glides toward targetBounds instead of snapping — targetBounds recenters on the main
  // walker every tick once windowed, and jumping the viewBox there instantly would read as a
  // jarring teleport rather than the walker simply moving.
  const bounds = useSmoothedBounds(targetBounds)
  // The minimap only earns its keep once the main view has actually had to window down to less
  // than the whole graph — on a graph that already fits, it would just be a smaller duplicate.
  const fullBounds = useMemo(() => computeGraphBounds(graph), [graph])
  const isWindowed = fullBounds.width > targetBounds.width + 1 || fullBounds.height > targetBounds.height + 1

  const discoveredNodes = useMemo(
    () => graph.nodes.filter((n) => discovery.discoveredNodeIds.has(n.id)),
    [graph, discovery.discoveredNodeIds],
  )
  const discoveredEdges = useMemo(
    () => graph.edges.filter((e) => discovery.discoveredEdgeIds.has(e.id)),
    [graph, discovery.discoveredEdgeIds],
  )

  // The edges actually stepped across, not just "both endpoints happen to be visited" — with
  // multiple independent searchers sharing one visited set, that looser check lit up edges none
  // of them had ever crossed whenever their territories merely touched.
  const traveledEdgeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const w of allWalkers) {
      for (let i = 0; i < w.path.length - 1; i++) {
        ids.add(edgeId(w.path[i], w.path[i + 1]))
      }
    }
    return ids
  }, [allWalkers])

  const currentNodeIds = useMemo(() => new Set(allWalkers.map((w) => w.currentNodeId)), [allWalkers])

  // Strategy visualization reflects the first searcher's view of the shared pool — with memory
  // shared across searchers, that pooled window (and discovery/DFS stack) is representative of
  // the whole group, not just one walker's private state.
  const highlightClassByNodeId = useMemo(() => {
    const primary = walkers[0]
    if (!primary) return new Map<NodeId, string>()
    const strategy = getStrategy(activeStrategyId)
    const syntheticWalker: WalkerState = { ...primary, path: [...sharedRecentPath, primary.currentNodeId] }
    const groups =
      strategy.getHighlightedNodes?.({
        graph,
        discovery,
        walker: syntheticWalker,
        memory: strategyMemories[0],
        memoryLevel: effectiveMemoryLevel,
      }) ?? []
    const map = new Map<NodeId, string>()
    for (const group of groups) {
      const className = HIGHLIGHT_CLASS_BY_KIND[group.kind]
      for (const nodeId of group.nodeIds) map.set(nodeId, className)
    }
    return map
  }, [activeStrategyId, graph, discovery, walkers, sharedRecentPath, strategyMemories, effectiveMemoryLevel])

  const walkerPositions = useMemo(
    () =>
      allWalkers
        .map((w, i) => ({ node: nodesById.get(w.currentNodeId), isMain: i === 0 }))
        .filter((entry): entry is { node: NonNullable<typeof entry.node>; isMain: boolean } => entry.node != null)
        .map(({ node, isMain }) => ({ x: node.x ?? 0, y: node.y ?? 0, isMain })),
    [allWalkers, nodesById],
  )

  const isCelebrating = status === 'celebrating'
  const isRedirecting = redirectPath !== null

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
            const isCurrent = currentNodeIds.has(node.id)
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
        {walkers.map((w, i) => {
          const transit = walkerTransits[i]
          const position = nodesById.get(transit?.nextNodeId ?? w.currentNodeId)
          return position ? (
            <WalkerToken
              key={`w-${i}`}
              x={position.x ?? 0}
              y={position.y ?? 0}
              travelMs={transit?.travelMs ?? 0}
              variant={i === 0 ? 'main' : 'forward'}
            />
          ) : null
        })}
        {walker2 &&
          (() => {
            const position = nodesById.get(walker2Transit?.nextNodeId ?? walker2.currentNodeId)
            return position ? (
              <WalkerToken x={position.x ?? 0} y={position.y ?? 0} travelMs={walker2Transit?.travelMs ?? 0} variant="reverse" />
            ) : null
          })()}
        {isCelebrating &&
          allWalkers.map((w, i) => {
            const position = nodesById.get(w.currentNodeId)
            if (!position) return null
            return (
              <g key={`burst-${i}`}>
                <circle cx={position.x} cy={position.y} className={styles.burstRing} style={{ animationDelay: '0ms' }} />
                <circle cx={position.x} cy={position.y} className={styles.burstRing} style={{ animationDelay: '180ms' }} />
                <circle cx={position.x} cy={position.y} className={styles.burstRing} style={{ animationDelay: '360ms' }} />
              </g>
            )
          })}
      </svg>
      {isCelebrating && <div className={styles.banner}>Exit found!</div>}
      {!isCelebrating && isRedirecting && <div className={styles.banner}>Exit found! Main walker heading there…</div>}
      {isWindowed && minimapOwned && minimapEnabled && (
        <Minimap graph={graph} discoveredNodeIds={discovery.discoveredNodeIds} walkerPositions={walkerPositions} viewport={bounds} />
      )}
    </div>
  )
}
