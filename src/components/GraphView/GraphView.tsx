import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { computeDynamicViewSize, computeGraphBounds, computeViewBounds } from '../../game/graph/layout'
import { edgeId } from '../../game/graph/types'
import type { GraphNode, NodeId } from '../../game/graph/types'
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

/** Ordinary nodes size by degree (one size class — double the radius — per extra edge), so a
 * busy hub reads as a bigger, brighter star at a glance. Clamped well below the generator's
 * minimum point spacing so even two adjacent high-degree stars never overlap. */
const STAR_BASE_RADIUS = 10
const STAR_MAX_RADIUS = 22
function starRadius(degree: number): number {
  return Math.min(STAR_MAX_RADIUS, Math.max(STAR_BASE_RADIUS, STAR_BASE_RADIUS * 2 ** (degree - 2)))
}
/** Start/goal are deliberately exempt from degree sizing — always the two biggest, most visible
 * stars on screen regardless of how many edges they happen to have. */
const BEACON_RADIUS = 28

function radiusForNode(node: GraphNode, degree: number): number {
  return node.isStart || node.isGoal ? BEACON_RADIUS : starRadius(degree)
}

/** Heading in degrees for a ship pointed from `fromId` toward `toId` — the edge it's currently
 * crossing while traveling, or the last edge it arrived on while sitting still (discovering). */
function headingAngle(fromId: NodeId | null | undefined, toId: NodeId, nodesById: Map<NodeId, GraphNode>): number {
  const from = fromId ? nodesById.get(fromId) : undefined
  const to = nodesById.get(toId)
  if (!from || !to) return 0
  const dx = (to.x ?? 0) - (from.x ?? 0)
  const dy = (to.y ?? 0) - (from.y ?? 0)
  if (dx === 0 && dy === 0) return 0
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

/** Deterministic xorshift32 PRNG seeded from the graph's own node ids, so the decorative
 * starfield is stable across re-renders of the same graph without needing to store random state. */
function seededRng(seedText: string): () => number {
  let seed = 0
  for (let i = 0; i < seedText.length; i++) seed = (seed * 31 + seedText.charCodeAt(i)) | 0
  let state = seed || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 100000) / 100000
  }
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
  const degreeByNodeId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, graph.adjacency[n.id]?.length ?? 0])), [graph])

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
  const bounds = useSmoothedBounds(targetBounds, graph)
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

  // Edges currently mid-flight for some walker, keyed to that hop's real travel time and —
  // critically — the walker's actual from/to node ids, not the edge's own (arbitrary, fixed at
  // generation time) source/target. A walker can cross any edge in either direction; rendering
  // the reveal from edge.source→edge.target regardless would draw it backwards relative to the
  // ship whenever a hop happens to run opposite the edge's stored orientation. Skips edges
  // already fully traveled (a revisit crossing an already-lit edge has nothing left to reveal).
  const revealingEdges = useMemo(() => {
    const map = new Map<string, { travelMs: number; fromId: NodeId; toId: NodeId }>()
    walkers.forEach((w, i) => {
      const transit = walkerTransits[i]
      if (!transit) return
      const id = edgeId(w.currentNodeId, transit.nextNodeId)
      if (!traveledEdgeIds.has(id)) map.set(id, { travelMs: transit.travelMs, fromId: w.currentNodeId, toId: transit.nextNodeId })
    })
    if (walker2 && walker2Transit) {
      const id = edgeId(walker2.currentNodeId, walker2Transit.nextNodeId)
      if (!traveledEdgeIds.has(id)) map.set(id, { travelMs: walker2Transit.travelMs, fromId: walker2.currentNodeId, toId: walker2Transit.nextNodeId })
    }
    return map
  }, [walkers, walkerTransits, walker2, walker2Transit, traveledEdgeIds])

  // Decorative background stars — purely visual, stable per-graph (not regenerated every render)
  // so they don't flicker/jump as the simulation ticks. Scattered across the whole graph's
  // extent (not just the current viewBox) so they pan naturally as the camera windows around.
  const skyStars = useMemo(() => {
    const rng = seededRng(graph.nodes.map((n) => n.id).join(','))
    return Array.from({ length: 70 }, () => ({
      x: fullBounds.minX + rng() * fullBounds.width,
      y: fullBounds.minY + rng() * fullBounds.height,
      // Big enough to survive being zoomed out to MAX_VIEW_SIZE without shrinking to a sub-pixel,
      // invisible dot, but deliberately smaller/dimmer than any gameplay star so the two never
      // compete for attention.
      r: 0.8 + rng() * 1.2,
      opacity: 0.12 + rng() * 0.28,
      delay: (rng() * 4).toFixed(1),
      duration: (2.4 + rng() * 2.6).toFixed(1),
    }))
  }, [graph, fullBounds])

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
        <defs>
          {/* Four-point sparkle: alternating long/short radius octagon, not a plain "+" cross —
              reserved for start/goal so it reads as a glint, not clutter on every star. */}
          <polygon id="star-sparkle" points="10,0 2.1,2.1 0,10 -2.1,2.1 -10,0 -2.1,-2.1 0,-10 2.1,-2.1" />
          {/* Classic 5-point star, outer radius 10 to match the sparkle's scale convention — the
              crisp core glyph for every ordinary node, so it reads as an actual star shape rather
              than a plain blurred disc. */}
          <polygon
            id="star-five-point"
            points="0,-10 2.65,-3.64 9.51,-3.09 4.28,1.39 5.88,8.09 0,4.5 -5.88,8.09 -4.28,1.39 -9.51,-3.09 -2.65,-3.64"
          />
        </defs>
        <g className={styles.skyLayer}>
          {skyStars.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              className={styles.dustStar}
              style={{ opacity: s.opacity, animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s` }}
            />
          ))}
        </g>
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
          {discoveredEdges.map((edge) => {
            const reveal = revealingEdges.get(edge.id)
            if (!reveal) return null
            const from = nodesById.get(reveal.fromId)
            const to = nodesById.get(reveal.toId)
            if (!from || !to) return null
            const len = Math.hypot((to.x ?? 0) - (from.x ?? 0), (to.y ?? 0) - (from.y ?? 0))
            return (
              <line
                key={`reveal-${edge.id}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className={styles.revealOverlay}
                style={
                  {
                    '--len': len,
                    strokeDasharray: `${len} ${len}`,
                    animationDuration: `${reveal.travelMs}ms`,
                  } as CSSProperties
                }
              />
            )
          })}
        </g>
        <g>
          {discoveredNodes.map((node) => {
            const isHighlighted = highlightClassByNodeId.has(node.id)
            const isCurrent = currentNodeIds.has(node.id)
            const isBeacon = node.isStart || node.isGoal
            const isPlainVisited = discovery.visitedNodeIds.has(node.id) && !isBeacon && !isCurrent && !isHighlighted
            const radius = radiusForNode(node, degreeByNodeId.get(node.id) ?? 2)
            // A flat-filled circle with a small blur just gets a soft edge — it still reads as
            // "a disc," not "glow." Three layers at decreasing size/increasing opacity, each
            // blurred by a chunk of its OWN radius (not a fixed px value), approximates a real
            // radial falloff: a wide, barely-there outer glow; a tighter, brighter mid glow; a
            // crisp, fully-opaque core with no blur at all.
            const outerRadius = radius * 0.4
            const midRadius = radius * 0.32
            const coreRadius = Math.max(3, radius * 0.3)
            const outerBlur = outerRadius * 0.15
            const midBlur = midRadius * 0.1
            const hue = isPlainVisited ? hueRotateForNode(node.id) : null

            // Same state classes drive fill color on every layer — only presentation (blur
            // amount, opacity, ring placement) differs between them, so the color language
            // stays identical to a single-circle node, just rendered as an actual glowing star.
            const stateClasses = [
              discovery.visitedNodeIds.has(node.id) ? styles.visited : '',
              node.isGoal ? styles.goal : '',
              node.isStart ? styles.start : '',
              isBeacon ? '' : highlightClassByNodeId.get(node.id) ?? '',
            ]
            // An inline `filter` replaces the CSS class's filter outright rather than composing
            // with it, so the per-node hue-rotate has to carry each layer's own blur along with
            // it — otherwise every plain-visited star (the majority of nodes mid-exploration)
            // would silently lose its glow the moment it's visited.
            const filterFor = (blurPx: number) => (hue != null ? `blur(${blurPx}px) hue-rotate(${hue}deg)` : blurPx > 0 ? `blur(${blurPx}px)` : undefined)

            return (
              <g key={node.id}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={outerRadius}
                  style={{ filter: filterFor(outerBlur) }}
                  className={[styles.node, styles.starOuterGlow, ...stateClasses].filter(Boolean).join(' ')}
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={midRadius}
                  style={{ filter: filterFor(midBlur) }}
                  className={[styles.node, styles.starMidGlow, ...stateClasses].filter(Boolean).join(' ')}
                />
                <use
                  href="#star-five-point"
                  transform={`translate(${node.x}, ${node.y}) scale(${coreRadius / 10})`}
                  style={hue != null ? { filter: `hue-rotate(${hue}deg)` } : undefined}
                  className={[styles.node, styles.starCore, ...stateClasses, isCurrent ? styles.currentNode : ''].filter(Boolean).join(' ')}
                />
                {isBeacon && (
                  <use
                    href="#star-sparkle"
                    transform={`translate(${node.x}, ${node.y}) scale(${radius / 14})`}
                    className={node.isStart ? styles.sparkleStart : styles.sparkleGoal}
                  />
                )}
              </g>
            )
          })}
        </g>
        {walkers.map((w, i) => {
          const transit = walkerTransits[i]
          const position = nodesById.get(transit?.nextNodeId ?? w.currentNodeId)
          const fromId = transit ? w.currentNodeId : w.previousNodeId
          const toId = transit ? transit.nextNodeId : w.currentNodeId
          // The node being orbited while discovering is always the one it's currently standing
          // on, not the (possibly not-yet-decided) one it's about to travel to.
          const atNode = nodesById.get(w.currentNodeId)
          const nodeRadius = atNode ? radiusForNode(atNode, degreeByNodeId.get(w.currentNodeId) ?? 2) : STAR_BASE_RADIUS
          return position ? (
            <WalkerToken
              key={`w-${i}`}
              x={position.x ?? 0}
              y={position.y ?? 0}
              travelMs={transit?.travelMs ?? 0}
              angle={headingAngle(fromId, toId, nodesById)}
              nodeRadius={nodeRadius}
              variant={i === 0 ? 'main' : 'forward'}
            />
          ) : null
        })}
        {walker2 &&
          (() => {
            const position = nodesById.get(walker2Transit?.nextNodeId ?? walker2.currentNodeId)
            const fromId = walker2Transit ? walker2.currentNodeId : walker2.previousNodeId
            const toId = walker2Transit ? walker2Transit.nextNodeId : walker2.currentNodeId
            const atNode = nodesById.get(walker2.currentNodeId)
            const nodeRadius = atNode ? radiusForNode(atNode, degreeByNodeId.get(walker2.currentNodeId) ?? 2) : STAR_BASE_RADIUS
            return position ? (
              <WalkerToken
                x={position.x ?? 0}
                y={position.y ?? 0}
                travelMs={walker2Transit?.travelMs ?? 0}
                angle={headingAngle(fromId, toId, nodesById)}
                nodeRadius={nodeRadius}
                variant="reverse"
              />
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
