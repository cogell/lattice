import dagre from '@dagrejs/dagre'
import { type Node, type Edge } from '@xyflow/react'

interface LayoutOptions {
  direction?: 'TB' | 'LR' | 'BT' | 'RL'
  nodeWidth?: number
  nodeHeight?: number
  rankSep?: number
  nodeSep?: number
}

export const DEFAULT_NODE_WIDTH = 200
export const DEFAULT_NODE_HEIGHT = 60

export function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  options?: LayoutOptions,
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const {
    direction = 'TB',
    nodeWidth = DEFAULT_NODE_WIDTH,
    nodeHeight = DEFAULT_NODE_HEIGHT,
    rankSep = 80,
    nodeSep = 40,
  } = options ?? {}

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, ranksep: rankSep, nodesep: nodeSep })

  for (const node of nodes) {
    g.setNode(node.id, { width: nodeWidth, height: nodeHeight })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const layoutedNodes = nodes.map((node) => {
    const pos = g.node(node.id)
    return {
      ...node,
      position: {
        x: pos.x - nodeWidth / 2,
        y: pos.y - nodeHeight / 2,
      },
    }
  })

  return { nodes: layoutedNodes, edges }
}
