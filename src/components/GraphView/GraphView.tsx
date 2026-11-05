import { useEffect, useMemo, useRef } from 'react'
import type { CSSProperties } from 'react'
import { MANUAL_MIN_VIEW_SIZE, MAX_VIEW_SIZE, MIN_VIEW_SIZE, computeDynamicViewSize, computeGraphBounds, computeViewBounds, minEdgeLength, viewScale } from '../../game/graph/layout'
import { edgeId } from '../../game/graph/types'
import type { GraphNode, NodeId } from '../../game/graph/types'
import { forwardTargetNodeId, isExitUnlocked } from '../../game/keys/keys'
import { getStrategy } from '../../game/strategies'
import type { HighlightKind } from '../../game/strategies'
import { computeEffectiveMemoryLevel } from '../../game/strategies/memory'
import type { WalkerState } from '../../game/walker/types'
import { usePrestigeStore } from '../../store/usePrestigeStore'
import { useProgressionStore } from '../../store/useProgressionStore'
import { useRunStore } from '../../store/useRunStore'
import { Minimap } from '../Minimap/Minimap'
import { CompassOverlay } from './CompassOverlay'
import { PickupCounter, PickupCounterStack } from './PickupCounter'
import { ScaleBar } from './ScaleBar'
import { WalkerToken } from '../WalkerToken/WalkerToken'
import styles from './GraphView.module.css'
import { useElementSize } from './useElementSize'
import { useInterpolatedPositions } from './useInterpolatedPositions'
import type { WalkerPositionInput } from './useInterpolatedPositions'
import { useManualZoom } from './useManualZoom'
import { useSmoothedBounds } from './useSmoothedBounds'

/** Which CSS class visualizes each kind of highlight group — shared across every strategy, since Node Memory now applies to all of them. */
const HIGHLIGHT_CLASS_BY_KIND: Record<HighlightKind, string> = {
  remembered: styles.inMemory,
  stack: styles.inStack,
  candidate: styles.bestCandidate,
  frontier: styles.frontier,
  path: styles.plannedPath,
  trail: styles.trailNode,
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
 * busy hub reads as a bigger, brighter star at a glance. These base radii are nominal: `starScale`
 * (see below) rescales them to the graph's actual node spacing, down on tight graphs and up on
 * spread-out high-level ones, so stars always stay proportioned to the distances between them. */
const STAR_BASE_RADIUS = 10
const STAR_MAX_RADIUS = 22
function starRadius(degree: number): number {
  return Math.min(STAR_MAX_RADIUS, Math.max(STAR_BASE_RADIUS, STAR_BASE_RADIUS * 2 ** (degree - 2)))
}
/** Start/goal are deliberately exempt from degree sizing — always the two biggest, most visible
 * stars on screen regardless of how many edges they happen to have. */
const BEACON_RADIUS = 28
/** Beacon diameter as a fraction of the graph's shortest edge — the knob starScale is built on.
 * 1.0 means two beacons on the tightest edge just touch, which reproduces the proportions the
 * game shipped with before the big spacing rebalance. Lower to shrink all stars proportionally
 * if they read as too big. */
const STAR_EDGE_FILL = 1.0
/** Floor on how far starScale is allowed to shrink stars — keeps them legible even on
 * pathologically tight local clusters rather than shrinking toward invisible pinpricks. */
const MIN_STAR_SCALE = 0.45
/** How much star size follows manual zoom outside the automatic camera's range. 1 = world-anchored
 * (stars shrink 1:1 on screen as the window grows), 0 = constant on-screen size regardless of
 * zoom. 0.5 splits the difference: zoom out 4× past the auto ceiling and stars appear half size
 * instead of quarter size; zoom in 4× below the reference window and they grow 2× on screen
 * instead of staying frozen. The single knob for dialing the zoom feel. */
const STAR_ZOOM_EXPONENT = 0.5
/** Cap on how far zoom-out is allowed to grow stars in world units, so at full-map overview on
 * huge graphs they can't swell into their neighbors. */
const MAX_STAR_ZOOM_GROWTH = 2.5
/** Caps how big ships get allowed to grow at the most extreme zoom-out — without a cap, the most
 * spread-out high-level graphs would blow the ships up well past what reads as "ship-sized". */
const MAX_WALKER_SCALE = 2.5
/** Flat size boost on every ship at every zoom level — the baseline ship glyph read as a touch
 * too small next to the spacing-scaled stars, so this nudges the whole walker-scale curve up
 * without touching its shape (the zoom-proportional range and MAX_WALKER_SCALE cap). */
const WALKER_SIZE_BOOST = 1.3

function radiusForNode(node: GraphNode, degree: number, starScale: number): number {
  return (node.isStart || node.isGoal ? BEACON_RADIUS : starRadius(degree)) * starScale
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
  const walkerTransits = useRunStore((s) => s.walkerTransits)
  const walkerSpeeds = useRunStore((s) => s.walkerSpeeds)
  const walkerRests = useRunStore((s) => s.walkerRests)
  const discovery = useRunStore((s) => s.discovery)
  const status = useRunStore((s) => s.status)
  const redirectPath = useRunStore((s) => s.redirectPath)
  const strategyMemories = useRunStore((s) => s.strategyMemories)
  const strategySharedMemory = useRunStore((s) => s.strategySharedMemory)
  const sharedRecentPath = useRunStore((s) => s.sharedRecentPath)
  const activeStrategyId = useProgressionStore((s) => s.activeStrategyId)
  const memoryLevel = useProgressionStore((s) => s.memoryLevel)
  const deepMemoryLevel = useProgressionStore((s) => s.deepMemoryLevel)
  const minimapOwned = usePrestigeStore((s) => s.minimapOwned)
  const minimapEnabled = usePrestigeStore((s) => s.minimapEnabled)
  const effectiveMemoryLevel = computeEffectiveMemoryLevel(
    memoryLevel,
    deepMemoryLevel,
    getStrategy(activeStrategyId).memoryMultiplier,
  )

  const nodesById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph])
  const degreeByNodeId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, graph.adjacency[n.id]?.length ?? 0])), [graph])

  // Continuous (x,y) per walker — the single source of truth for where a walker is on screen.
  // WalkerToken renders at exactly this point each frame, the reveal-line endpoint reads it, and
  // the camera focuses on it, so the three can never drift apart. Using raw currentNodeId instead
  // would freeze everything on the node a walker just left for the whole hop, then snap on arrival.
  const positionInputs = useMemo<WalkerPositionInput[]>(
    () =>
      walkers.map((w, idx) => ({
        currentNodeId: w.currentNodeId,
        transit: walkerTransits[idx] ?? null,
        v0: walkerSpeeds[idx] ?? 0,
      })),
    [walkers, walkerTransits, walkerSpeeds],
  )
  const interpolatedPositions = useInterpolatedPositions(positionInputs, nodesById)

  // Bounds come from the whole graph (not just discovered nodes), so the view never rescales as
  // fog lifts — it just shows more of a frame that was already fixed. Below MAX_VIEW_SIZE that
  // frame is the whole graph, static for its lifetime; past it, node circles would shrink to
  // near-invisible dots if we kept fitting everything, so the view instead becomes a window
  // centered on the main walker (walkers[0]) — centering on the average of every walker's
  // position instead could land the camera on empty space between two widely spread-out walkers,
  // with neither actually on screen.
  const focus = interpolatedPositions[0] ?? { x: 0, y: 0 }
  // Every other active walker, used only to size the window — not to move its center.
  const otherWalkerPositions = interpolatedPositions.slice(1)
  // The one zoom knob that keeps the camera (and everything sized against it) scale-invariant as
  // node spacing grows with level — see layout.ts's viewScale.
  const scale = useMemo(() => viewScale(graph), [graph])
  // Real node spacing, fed to the scale bar so a new, more spread-out graph flashes its % growth.
  const spacing = useMemo(() => minEdgeLength(graph), [graph])
  const fullBounds = useMemo(() => computeGraphBounds(graph), [graph])
  // Not memoized: focus/otherWalkerPositions now change continuously (every interpolation
  // frame), so memoizing against them would never hit anyway.
  const autoViewSize = computeDynamicViewSize(focus, otherWalkerPositions, scale, graph)
  // Lets the player scroll to zoom closer to/farther from the main walker, overriding the
  // automatic window size above until they opt back in via the "resume autoscroll" button — the
  // walker-tracking/centering logic below is untouched either way, so panning keeps working
  // identically at whatever zoom level is currently in effect. Zoom-out is allowed well past the
  // auto camera's cap, all the way to a whole-map overview, so the player can always survey
  // their surroundings on big graphs.
  const { manualSize, zoomBy, resumeAuto } = useManualZoom(
    graph,
    MANUAL_MIN_VIEW_SIZE * scale,
    Math.max(MAX_VIEW_SIZE * scale, fullBounds.width, fullBounds.height),
  )
  const dynamicViewSize = manualSize ?? autoViewSize
  // Measured live off the actual rendered <svg> so the viewBox can be widened/heightened to match
  // it — the container's CSS (width: 100%, height: 70vh capped at 600px) makes its real pixel
  // aspect ratio unknowable at render time without measuring, and a mismatched viewBox aspect
  // ratio gets letterboxed by the SVG's default viewBox scaling otherwise.
  const [svgRef, svgSize] = useElementSize<SVGSVGElement>()
  const containerAspectRatio = svgSize.width > 0 && svgSize.height > 0 ? svgSize.width / svgSize.height : undefined
  const targetBounds = computeViewBounds(graph, focus.x, focus.y, dynamicViewSize, containerAspectRatio)
  // Read inside the wheel listener instead of a dependency — dynamicViewSize changes essentially
  // every tick, and re-attaching a native listener that often is both wasteful and risks missing
  // an event mid-swap; the ref always has the latest value without that churn.
  const dynamicViewSizeRef = useRef(dynamicViewSize)
  useEffect(() => {
    dynamicViewSizeRef.current = dynamicViewSize
  }, [dynamicViewSize])
  const wrapperRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    // A precision trackpad can fire many wheel events within a single animation frame — applying
    // each one as its own React state update (and SVG viewBox change, which forces a layout) is
    // more render/layout work per frame than the browser can keep up with, which is what reads as
    // jagged. Accumulating deltas and flushing once per rAF caps this at one update per frame.
    let pendingDeltaY = 0
    let rafId: number | null = null
    function flush(): void {
      rafId = null
      if (pendingDeltaY === 0) return
      zoomBy(pendingDeltaY, dynamicViewSizeRef.current)
      pendingDeltaY = 0
    }
    // React's synthetic onWheel is passive by default, so preventDefault() inside it can't stop
    // the page itself from scrolling — only a real, non-passive native listener can.
    function handleWheel(e: WheelEvent): void {
      e.preventDefault()
      pendingDeltaY += e.deltaY
      if (rafId === null) rafId = requestAnimationFrame(flush)
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', handleWheel)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [zoomBy])
  // Smoothly glides toward targetBounds instead of snapping — targetBounds recenters on the main
  // walker every tick once windowed, and jumping the viewBox there instantly would read as a
  // jarring teleport rather than the walker simply moving. Still called unconditionally during
  // manual zoom (hooks can't be skipped), so its internal "displayed" state keeps tracking
  // targetBounds in the background and is already caught up by the time resumeAuto hands control
  // back to it. But its output isn't used while manual: a wheel event can fire dozens of times a
  // second, and restarting a 350ms ease-out tween that often mid-flight is what read as jagged —
  // scrolling is already a continuous, user-driven input, so during manual zoom the raw
  // (unsmoothed) target is applied directly instead of fighting it with another animation.
  const smoothedBounds = useSmoothedBounds(targetBounds, graph)
  const bounds = manualSize !== null ? targetBounds : smoothedBounds
  // Ships are fixed-size SVG coordinates, so as the viewBox window grows on big, spread-out
  // graphs (high levels) they'd otherwise shrink along with everything else until barely
  // visible — scale them back up relative to the smallest window size to stay legible. Both the
  // window and the reference size carry the viewScale multiplier, so ships keep the same
  // on-screen size range at every level. Below the standard tracking window (manual zoom-in) the
  // ratio drops under 1 and ships shrink in step with the window — the same steady-on-screen-size
  // treatment as starScale below, so a close zoom inspects the neighborhood rather than blowing
  // the ship up to fill it.
  const walkerScale = useMemo(
    () => WALKER_SIZE_BOOST * scale * Math.min(MAX_WALKER_SCALE, bounds.width / (MIN_VIEW_SIZE * scale)),
    [bounds.width, scale],
  )
  // Stars are fixed-size SVG coordinates too, so they track the graph's real node spacing in both
  // directions: shrunk on a tight early graph so they never overlap their neighbors, grown as
  // spacing (and the camera window with it) expands at higher levels so they don't dwindle to dots.
  const spacingStarScale = useMemo(
    () => Math.max(MIN_STAR_SCALE, (minEdgeLength(graph) * STAR_EDGE_FILL) / (2 * BEACON_RADIUS)),
    [graph],
  )
  // On top of that, stars follow *manual* zoom sublinearly (ratio^STAR_ZOOM_EXPONENT) instead of
  // staying hard world-anchored: zooming out past the auto camera's ceiling shrinks them on
  // screen, but slower than the world, so a full-map overview still shows visible glows instead
  // of dots; zooming in below the reference window grows the world faster than the stars, so they
  // gently swell on screen instead of ballooning until a halo fills the view. Across the whole
  // automatic zoom range between those two bounds the factor is exactly 1 — world-anchored,
  // calibrated to node spacing by spacingStarScale above. That dead zone is deliberate: the auto
  // window (and the aspect-ratio expansion on wide screens) puts bounds.width above the reference
  // constantly during normal play, and letting the curve act there inflated every star past its
  // spacing calibration and visibly pulsed them as the window breathed.
  const zoomRatio = bounds.width / (MIN_VIEW_SIZE * scale)
  const autoMaxRatio = MAX_VIEW_SIZE / MIN_VIEW_SIZE
  const zoomStarGrowth =
    zoomRatio < 1
      ? zoomRatio ** STAR_ZOOM_EXPONENT
      : zoomRatio <= autoMaxRatio
        ? 1
        : Math.min(MAX_STAR_ZOOM_GROWTH, (zoomRatio / autoMaxRatio) ** STAR_ZOOM_EXPONENT)
  const starScale = spacingStarScale * zoomStarGrowth
  // Legibility floor for star cores (the only visible part of a dim, unvisited star — its glow
  // layers are nearly transparent), anchored to the screen rather than graph units: the old flat
  // 3-unit floor stopped small stars from shrinking with manual zoom-in while everything around
  // them kept scaling. 3 units per MIN_VIEW_SIZE of window is exactly the old floor at the
  // reference window, now holding a constant on-screen size at every zoom level instead.
  const coreFloorRadius = 3 * (bounds.width / MIN_VIEW_SIZE)
  // The minimap only earns its keep once the main view has actually had to window down to less
  // than the whole graph — on a graph that already fits, it would just be a smaller duplicate.
  const isWindowed = fullBounds.width > targetBounds.width + 1 || fullBounds.height > targetBounds.height + 1

  const discoveredNodes = useMemo(
    () => graph.nodes.filter((n) => discovery.discoveredNodeIds.has(n.id)),
    [graph, discovery.discoveredNodeIds],
  )
  const neutronStars = useMemo(() => graph.nodes.filter((n) => n.isNeutronStar), [graph])
  const exitUnlocked = useMemo(() => isExitUnlocked(graph, discovery), [graph, discovery])
  const keyProgress = useMemo(() => {
    const keys = graph.nodes.filter((n) => n.isKey)
    return { total: keys.length, collected: keys.filter((n) => discovery.visitedNodeIds.has(n.id)).length }
  }, [graph, discovery])
  // Neutron stars are flagged when the level is generated, so the total is the count the level started with.
  const pulsarProgress = useMemo(
    () => ({ total: neutronStars.length, collected: neutronStars.filter((n) => discovery.visitedNodeIds.has(n.id)).length }),
    [neutronStars, discovery],
  )
  const prefersReducedMotion = useMemo(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const discoveredEdges = useMemo(
    () => graph.edges.filter((e) => discovery.discoveredEdgeIds.has(e.id)),
    [graph, discovery.discoveredEdgeIds],
  )

  // The edges actually stepped across, not just "both endpoints happen to be visited" — with
  // multiple independent searchers sharing one visited set, that looser check lit up edges none
  // of them had ever crossed whenever their territories merely touched.
  const traveledEdgeIds = useMemo(() => {
    const ids = new Set<string>()
    for (const w of walkers) {
      for (let i = 0; i < w.path.length - 1; i++) {
        ids.add(edgeId(w.path[i], w.path[i + 1]))
      }
    }
    return ids
  }, [walkers])

  const currentNodeIds = useMemo(() => new Set(walkers.map((w) => w.currentNodeId)), [walkers])

  // Edges currently mid-flight for some walker, keyed to that hop's real travel time and —
  // critically — the walker's actual from/to node ids, not the edge's own (arbitrary, fixed at
  // generation time) source/target. A walker can cross any edge in either direction; rendering
  // the reveal from edge.source→edge.target regardless would draw it backwards relative to the
  // ship whenever a hop happens to run opposite the edge's stored orientation. Skips edges
  // already fully traveled (a revisit crossing an already-lit edge has nothing left to reveal).
  const revealingEdges = useMemo(() => {
    const map = new Map<string, { fromId: NodeId; walkerIndex: number }>()
    walkers.forEach((w, i) => {
      const transit = walkerTransits[i]
      if (!transit) return
      const id = edgeId(w.currentNodeId, transit.nextNodeId)
      if (!traveledEdgeIds.has(id)) map.set(id, { fromId: w.currentNodeId, walkerIndex: i })
    })
    return map
  }, [walkers, walkerTransits, traveledEdgeIds])

  // Decorative background stars — purely visual, stable per-graph (not regenerated every render)
  // so they don't flicker/jump as the simulation ticks. Scattered across the whole graph's
  // extent (not just the current viewBox) so they pan naturally as the camera windows around.
  const skyStars = useMemo(() => {
    const rng = seededRng(graph.nodes.map((n) => n.id).join(','))
    return Array.from({ length: 70 }, () => ({
      x: fullBounds.minX + rng() * fullBounds.width,
      y: fullBounds.minY + rng() * fullBounds.height,
      // Scaled with the view so they survive the bigger windows of high-level graphs without
      // shrinking to sub-pixel, invisible dots, but deliberately smaller/dimmer than any gameplay
      // star so the two never compete for attention. The zoom response (zoomStarGrowth) is
      // applied at render time, not baked in here, so zooming doesn't regenerate the field.
      r: (0.8 + rng() * 1.2) * scale,
      opacity: 0.12 + rng() * 0.28,
      delay: (rng() * 4).toFixed(1),
      duration: (2.4 + rng() * 2.6).toFixed(1),
    }))
  }, [graph, fullBounds, scale])

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
        walkerIndex: 0,
        // Same target the Spaceship's algorithm is actually given, so its path highlight follows keys first.
        targetNodeId: forwardTargetNodeId(graph, discovery, primary.currentNodeId),
        sharedMemory: strategySharedMemory,
      }) ?? []
    const map = new Map<NodeId, string>()
    for (const group of groups) {
      const className = HIGHLIGHT_CLASS_BY_KIND[group.kind]
      for (const nodeId of group.nodeIds) map.set(nodeId, className)
    }
    return map
  }, [activeStrategyId, graph, discovery, walkers, sharedRecentPath, strategyMemories, strategySharedMemory, effectiveMemoryLevel])

  const walkerPositions = useMemo(
    () =>
      walkers
        .map((w, i) => ({ node: nodesById.get(w.currentNodeId), isMain: i === 0 }))
        .filter((entry): entry is { node: NonNullable<typeof entry.node>; isMain: boolean } => entry.node != null)
        .map(({ node, isMain }) => ({ x: node.x ?? 0, y: node.y ?? 0, isMain })),
    [walkers, nodesById],
  )

  const isCelebrating = status === 'celebrating'
  const isRedirecting = redirectPath !== null

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <svg
        ref={svgRef}
        className={styles.graph}
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
        // Lets the stylesheet's graph-space sizes (edge strokes, win burst) grow with the graph's
        // spacing — SVG user units count as px in CSS, so calc(Npx * var(--view-scale)) works.
        style={{ '--view-scale': scale } as CSSProperties}
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
              r={s.r * zoomStarGrowth}
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
            const to = interpolatedPositions[reveal.walkerIndex]
            if (!from || !to) return null
            return <line key={`reveal-${edge.id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={styles.revealOverlay} />
          })}
        </g>
        <g>
          {discoveredNodes.map((node) => {
            const isHighlighted = highlightClassByNodeId.has(node.id)
            const isCurrent = currentNodeIds.has(node.id)
            const isBeacon = node.isStart || node.isGoal
            const isNeutronStar = node.isNeutronStar === true && !isBeacon
            const isKey = node.isKey === true && !isBeacon
            const isPlainVisited = discovery.visitedNodeIds.has(node.id) && !isBeacon && !isNeutronStar && !isKey && !isCurrent && !isHighlighted
            const radius = radiusForNode(node, degreeByNodeId.get(node.id) ?? 2, starScale)
            // A flat-filled circle with a small blur just gets a soft edge — it still reads as
            // "a disc," not "glow." Three layers at decreasing size/increasing opacity, each
            // blurred by a chunk of its OWN radius (not a fixed px value), approximates a real
            // radial falloff: a wide, barely-there outer glow; a tighter, brighter mid glow; a
            // crisp, fully-opaque core with no blur at all.
            const outerRadius = radius * 0.4
            const midRadius = radius * 0.32
            const coreRadius = Math.max(coreFloorRadius, radius * 0.3)
            const outerBlur = outerRadius * 0.15
            const midBlur = midRadius * 0.1
            const hue = isPlainVisited ? hueRotateForNode(node.id) : null

            // Same state classes drive fill color on every layer — only presentation (blur
            // amount, opacity, ring placement) differs between them, so the color language
            // stays identical to a single-circle node, just rendered as an actual glowing star.
            const stateClasses = [
              discovery.visitedNodeIds.has(node.id) ? styles.visited : '',
              node.isGoal ? styles.goal : '',
              node.isGoal && !exitUnlocked ? styles.goalLocked : '',
              node.isStart ? styles.start : '',
              isNeutronStar ? (discovery.visitedNodeIds.has(node.id) ? styles.neutronStarSpent : styles.neutronStar) : '',
              isKey ? (discovery.visitedNodeIds.has(node.id) ? styles.keySpent : styles.key) : '',
              isBeacon ? '' : highlightClassByNodeId.get(node.id) ?? '',
            ]
            // An inline `filter` replaces the CSS class's filter outright rather than composing
            // with it, so the per-node hue-rotate has to carry each layer's own blur along with
            // it — otherwise every plain-visited star (the majority of nodes mid-exploration)
            // would silently lose its glow the moment it's visited.
            const filterFor = (blurPx: number) => (hue != null ? `blur(${blurPx}px) hue-rotate(${hue}deg)` : blurPx > 0 ? `blur(${blurPx}px)` : undefined)

            return (
              <g key={node.id} className={styles.nodeEnter} style={{ transformOrigin: `${node.x}px ${node.y}px` }}>
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
        {/* Neutron stars shine through fog: every uncollected one gets a pulsar marker — a hot
            blue-white core with two rotating beams in the Scanner Array's green — whether it's been
            discovered yet or not. Collected ones drop the marker (their star stays dim green). */}
        <g className={styles.pulsarLayer}>
          {neutronStars.map((node) => {
            if (discovery.visitedNodeIds.has(node.id)) return null
            const size = STAR_BASE_RADIUS * starScale
            return (
              <g key={`pulsar-${node.id}`} transform={`translate(${node.x}, ${node.y})`}>
                <circle r={size * 0.9} className={styles.pulsarHalo} />
                <g>
                  <polygon points={`${-size * 2.6},0 0,${-size * 0.16} ${size * 2.6},0 0,${size * 0.16}`} className={styles.pulsarBeam} />
                  {!prefersReducedMotion && (
                    <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="5s" repeatCount="indefinite" />
                  )}
                </g>
                <circle r={Math.max(coreFloorRadius, size * 0.22)} className={styles.pulsarCore} />
              </g>
            )
          })}
        </g>
        {walkers.map((w, i) => {
          const transit = walkerTransits[i]
          const position = interpolatedPositions[i]
          const fromId = transit ? w.currentNodeId : w.previousNodeId
          const toId = transit ? transit.nextNodeId : w.currentNodeId
          // The node being orbited while discovering is always the one it's currently standing
          // on, not the (possibly not-yet-decided) one it's about to travel to.
          const atNode = nodesById.get(w.currentNodeId)
          const nodeRadius = atNode ? radiusForNode(atNode, degreeByNodeId.get(w.currentNodeId) ?? 2, starScale) : STAR_BASE_RADIUS * starScale
          return position ? (
            <WalkerToken
              key={`w-${i}`}
              x={position.x}
              y={position.y}
              travelMs={transit?.travelMs ?? 0}
              angle={headingAngle(fromId, toId, nodesById)}
              nodeRadius={nodeRadius}
              variant={i === 0 ? 'main' : w.origin === 'goal' ? 'reverse' : 'forward'}
              scale={walkerScale}
              startedAt={transit?.startedAt}
              accelEndMs={transit?.accelEndMs}
              decelStartMs={transit?.decelStartMs}
              restStartedAt={walkerRests[i]?.startedAt}
              restWaitMs={walkerRests[i]?.waitMs}
            />
          ) : null
        })}
        {isCelebrating &&
          walkers.map((w, i) => {
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
      {manualSize !== null && (
        <button type="button" className={styles.resumeAutoButton} onClick={resumeAuto} aria-label="Resume automatic camera">
          ⊙
        </button>
      )}
      {(() => {
        // The exit compass: only for strategies that genuinely navigate by the exit's position, and
        // only once it's actually been discovered — fog-of-war stays honest. Bearing is computed in
        // world coordinates from the Spaceship's continuous position; the camera never rotates, so
        // the same angle is correct on screen at any zoom or pan.
        if (isCelebrating || (activeStrategyId !== 'a-star' && activeStrategyId !== 'compass')) return null
        if (!discovery.discoveredNodeIds.has(graph.goalNodeId)) return null
        const goal = nodesById.get(graph.goalNodeId)
        if (!goal) return null
        const angleDeg = (Math.atan2((goal.y ?? 0) - focus.y, (goal.x ?? 0) - focus.x) * 180) / Math.PI
        return <CompassOverlay angleDeg={angleDeg} />
      })()}
      {/* The viewBox's aspect ratio is matched to the svg's, so width alone gives world units per pixel. */}
      {svgSize.width > 0 && <ScaleBar worldPerPixel={bounds.width / svgSize.width} spacing={spacing} />}
      <PickupCounterStack>
        <PickupCounter kind="key" collected={keyProgress.collected} total={keyProgress.total} />
        <PickupCounter kind="pulsar" collected={pulsarProgress.collected} total={pulsarProgress.total} />
      </PickupCounterStack>
      {isCelebrating && <div className={styles.banner}>Exit found!</div>}
      {!isCelebrating && isRedirecting && <div className={styles.banner}>Exit found! Spaceship heading there…</div>}
      {isWindowed && minimapOwned && minimapEnabled && (
        <Minimap graph={graph} discoveredNodeIds={discovery.discoveredNodeIds} walkerPositions={walkerPositions} viewport={bounds} />
      )}
    </div>
  )
}
