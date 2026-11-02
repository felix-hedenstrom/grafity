export type NodeId = string

export interface GraphNode {
  id: NodeId
  isStart: boolean
  isGoal: boolean
  /** Set by the force-layout simulation; absent before layout has run. */
  x?: number
  y?: number
  vx?: number
  vy?: number
}

export interface GraphEdge {
  id: string
  source: NodeId
  target: NodeId
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  startNodeId: NodeId
  goalNodeId: NodeId
  adjacency: Record<NodeId, NodeId[]>
}

export function edgeId(a: NodeId, b: NodeId): string {
  return a < b ? `${a}--${b}` : `${b}--${a}`
}

/** The Euclidean distance between two adjacent nodes' laid-out positions — used directly as both pathfinding cost and the distance the speed system divides by to pace movement. */
export function getEdgeWeight(graph: Graph, a: NodeId, b: NodeId): number {
  const nodeA = graph.nodes.find((node) => node.id === a)
  const nodeB = graph.nodes.find((node) => node.id === b)
  const dx = (nodeA?.x ?? 0) - (nodeB?.x ?? 0)
  const dy = (nodeA?.y ?? 0) - (nodeB?.y ?? 0)
  return Math.hypot(dx, dy)
}
