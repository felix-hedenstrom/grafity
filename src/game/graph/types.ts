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
  /** Unused by the MVP's strategies; present so weighted algorithms (Dijkstra/A*) don't need a type change later. */
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
