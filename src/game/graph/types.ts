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
  /** The edge's travel distance — derived from its real geometric length, but reshaped by percentile rank within the graph (see reshapeWeights in generatePlanar.ts) so the shortest:longest ratio across the whole graph is controlled and extremes are rare. Used both as pathfinding cost for Dijkstra/A*, and as the distance the speed system divides by to pace movement. */
  weight: number
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

/** The weight (real distance) of the edge between two adjacent nodes. */
export function getEdgeWeight(graph: Graph, a: NodeId, b: NodeId): number {
  const key = edgeId(a, b)
  return graph.edges.find((edge) => edge.id === key)?.weight ?? 0
}
