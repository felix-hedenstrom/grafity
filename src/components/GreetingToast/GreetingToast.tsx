import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '../Modal/Modal'
import { WalkerToken } from '../WalkerToken/WalkerToken'
import { useUiStore } from '../../store/useUiStore'
import graphStyles from '../GraphView/GraphView.module.css'
import styles from './GreetingToast.module.css'

interface DemoNode {
  x: number
  y: number
  isStart?: boolean
  isGoal?: boolean
}

/** A small, fixed stand-in graph — purely illustrative, unrelated to any real graph layout. */
const DEMO_NODES: DemoNode[] = [
  { x: 20, y: 60, isStart: true },
  { x: 65, y: 18 },
  { x: 115, y: 50 },
  { x: 165, y: 18 },
  { x: 215, y: 60, isGoal: true },
]

const DUST_STARS = [
  { x: 15, y: 15, r: 0.8 },
  { x: 55, y: 68, r: 1 },
  { x: 95, y: 12, r: 0.7 },
  { x: 140, y: 68, r: 0.9 },
  { x: 190, y: 14, r: 0.8 },
  { x: 230, y: 30, r: 0.7 },
]

const ORDINARY_RADIUS = 7
const BEACON_RADIUS = 11
const DISCOVER_MS = 700
const TRAVEL_MS = 650
const GOAL_DWELL_MS = 1800
const RESET_MS = 600

function demoNodeRadius(node: DemoNode): number {
  return node.isStart || node.isGoal ? BEACON_RADIUS : ORDINARY_RADIUS
}

function headingAngle(from: DemoNode, to: DemoNode): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI
}

/** Same three-layer glow construction GraphView uses for every real star — a wide, barely-there outer
 * glow, a tighter mid glow, and a crisp core — so the demo's nodes read as the exact same stars. */
function DemoStar({ node, isCurrent }: { node: DemoNode; isCurrent: boolean }) {
  const radius = demoNodeRadius(node)
  const outerRadius = radius * 0.4
  const midRadius = radius * 0.32
  const coreRadius = Math.max(3, radius * 0.3)
  const stateClasses = [graphStyles.visited, node.isGoal ? graphStyles.goal : '', node.isStart ? graphStyles.start : '']

  return (
    <g>
      <circle
        cx={node.x}
        cy={node.y}
        r={outerRadius}
        style={{ filter: `blur(${outerRadius * 0.15}px)` }}
        className={[graphStyles.node, graphStyles.starOuterGlow, ...stateClasses].filter(Boolean).join(' ')}
      />
      <circle
        cx={node.x}
        cy={node.y}
        r={midRadius}
        style={{ filter: `blur(${midRadius * 0.1}px)` }}
        className={[graphStyles.node, graphStyles.starMidGlow, ...stateClasses].filter(Boolean).join(' ')}
      />
      <use
        href="#greeting-star-five-point"
        transform={`translate(${node.x}, ${node.y}) scale(${coreRadius / 10})`}
        className={[graphStyles.node, graphStyles.starCore, ...stateClasses, isCurrent ? graphStyles.currentNode : ''].filter(Boolean).join(' ')}
      />
      {(node.isStart || node.isGoal) && (
        <use
          href="#greeting-star-sparkle"
          transform={`translate(${node.x}, ${node.y}) scale(${radius / 14})`}
          className={node.isStart ? graphStyles.sparkleStart : graphStyles.sparkleGoal}
        />
      )}
    </g>
  )
}

/** The same self-drawing "laser" GraphView overlays on an edge while a walker is actually crossing it. */
function RevealLaser({ from, to, travelMs }: { from: DemoNode; to: DemoNode; travelMs: number }) {
  const len = Math.hypot(to.x - from.x, to.y - from.y)
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      className={graphStyles.revealOverlay}
      style={{ '--len': len, strokeDasharray: `${len} ${len}`, animationDuration: `${travelMs}ms` } as CSSProperties}
    />
  )
}

/**
 * A small looping demo that reuses the real game's own node-star, edge-reveal, and WalkerToken
 * (Spaceship only — no UFOs, so the intro doesn't spoil that upgrade) rendering, so the tutorial
 * visually matches what a new player is about to see rather than a generic stand-in animation.
 */
function DiscoveryDemo() {
  const [step, setStep] = useState(0)
  const [phase, setPhase] = useState<'discovering' | 'traveling' | 'resetting'>('discovering')
  const [cycle, setCycle] = useState(0)
  const isLast = step === DEMO_NODES.length - 1

  useEffect(() => {
    const dwellMs = phase === 'discovering' ? (isLast ? GOAL_DWELL_MS : DISCOVER_MS) : phase === 'traveling' ? TRAVEL_MS : RESET_MS
    const timer = setTimeout(() => {
      if (phase === 'discovering') {
        setPhase(isLast ? 'resetting' : 'traveling')
      } else if (phase === 'traveling') {
        setStep((s) => s + 1)
        setPhase('discovering')
      } else {
        setCycle((c) => c + 1)
        setStep(0)
        setPhase('discovering')
      }
    }, dwellMs)
    return () => clearTimeout(timer)
  }, [phase, step, isLast])

  const current = DEMO_NODES[step]
  const next = !isLast ? DEMO_NODES[step + 1] : null
  const prev = step > 0 ? DEMO_NODES[step - 1] : null
  const traveling = phase === 'traveling' && next !== null

  const walkerTarget = traveling && next ? next : current
  const walkerAngle = traveling && next ? headingAngle(current, next) : prev ? headingAngle(prev, current) : 0

  return (
    <svg className={graphStyles.graph} style={{ height: 110 }} viewBox="0 0 240 80" role="img" aria-label="Animation of a walker discovering nodes along a graph">
      <defs>
        <polygon id="greeting-star-sparkle" points="10,0 2.1,2.1 0,10 -2.1,2.1 -10,0 -2.1,-2.1 0,-10 2.1,-2.1" />
        <polygon
          id="greeting-star-five-point"
          points="0,-10 2.65,-3.64 9.51,-3.09 4.28,1.39 5.88,8.09 0,4.5 -5.88,8.09 -4.28,1.39 -9.51,-3.09 -2.65,-3.64"
        />
      </defs>
      <g key={cycle}>
        <g className={graphStyles.skyLayer}>
          {DUST_STARS.map((s, i) => (
            <circle
              key={i}
              cx={s.x}
              cy={s.y}
              r={s.r}
              className={graphStyles.dustStar}
              style={{ opacity: 0.3, animationDelay: `${i * 0.3}s`, animationDuration: '3s' }}
            />
          ))}
        </g>
        {DEMO_NODES.slice(0, step).map((from, i) => {
          const to = DEMO_NODES[i + 1]
          return <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={[graphStyles.edge, graphStyles.traveledEdge].join(' ')} />
        })}
        {traveling && next && (
          <>
            <line x1={current.x} y1={current.y} x2={next.x} y2={next.y} className={graphStyles.edge} />
            <RevealLaser from={current} to={next} travelMs={TRAVEL_MS} />
          </>
        )}
        {DEMO_NODES.slice(0, step + 1).map((node, i) => (
          <DemoStar key={i} node={node} isCurrent={i === step} />
        ))}
        {isLast && phase === 'discovering' && (
          <>
            <circle cx={current.x} cy={current.y} className={graphStyles.burstRing} style={{ animationDelay: '0ms' }} />
            <circle cx={current.x} cy={current.y} className={graphStyles.burstRing} style={{ animationDelay: '180ms' }} />
            <circle cx={current.x} cy={current.y} className={graphStyles.burstRing} style={{ animationDelay: '360ms' }} />
          </>
        )}
        <WalkerToken
          x={walkerTarget.x}
          y={walkerTarget.y}
          travelMs={traveling ? TRAVEL_MS : 0}
          angle={walkerAngle}
          nodeRadius={demoNodeRadius(current)}
          variant="main"
          scale={1.4}
        />
      </g>
    </svg>
  )
}

/** Auto-opens once, ever, on first visit (tracked by hasSeenIntro); re-summoned afterward via the "?" button next to the Speed box. */
export function GreetingToast() {
  const introOpen = useUiStore((s) => s.introOpen)
  const hasSeenIntro = useUiStore((s) => s.hasSeenIntro)
  const openIntro = useUiStore((s) => s.openIntro)
  const closeIntro = useUiStore((s) => s.closeIntro)
  const markIntroSeen = useUiStore((s) => s.markIntroSeen)

  useEffect(() => {
    if (!hasSeenIntro) {
      openIntro()
      markIntroSeen()
    }
    // Fire once on mount only — hasSeenIntro flips to true inside this effect, so a dependency array would just be noise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!introOpen) return null

  return (
    <Modal title="Welcome to Grafity" onClose={closeIntro}>
      <div className={styles.body}>
        <DiscoveryDemo />
        <p>Grafity is a graph-exploration idle game.</p>
        <p>
          Your <strong>Spaceship</strong> wanders a hidden graph, discovering nodes as it goes. Every node discovered earns{' '}
          <strong>Insight</strong> — spend it in the Shop to unlock smarter search algorithms and speed upgrades.
        </p>
        <p>Reach the goal node to grow the graph and start a bigger level.</p>
        <p>Click the ⚙ next to the Speed box any time to adjust options, or the ? to see this again.</p>
      </div>
    </Modal>
  )
}
