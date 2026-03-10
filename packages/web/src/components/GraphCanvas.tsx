import { useMemo } from 'react'
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  type Node,
  type Edge,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { GraphNode, type GraphNodeData } from './GraphNode'
import { GraphEdge, type GraphEdgeData } from './GraphEdge'
import { getLayoutedElements } from '@/lib/dagre-layout'
import type { ViewData } from '@lattice/shared'

// Define nodeTypes and edgeTypes OUTSIDE the component to prevent infinite re-renders.
// React Flow uses referential equality checks on these maps, so if they're created
// inside the component they'll be new objects every render and cause an infinite loop.
const nodeTypes = { graphNode: GraphNode }
const edgeTypes = { graphEdge: GraphEdge }

interface GraphCanvasProps {
  viewData: ViewData
}

export function GraphCanvas({ viewData }: GraphCanvasProps) {
  const { nodes, edges } = useMemo(() => {
    // Build lookup maps for types
    const nodeTypeMap = new Map(viewData.node_types.map((t) => [t.id, t]))
    const edgeTypeMap = new Map(viewData.edge_types.map((t) => [t.id, t]))

    // Transform nodes into React Flow nodes
    const rfNodes: Node<GraphNodeData>[] = viewData.nodes.map((node) => {
      const nodeType = nodeTypeMap.get(node.node_type_id)

      // Resolve display label: prefer the display field value, fall back to truncated ID
      let label = node.id.slice(0, 8)
      if (
        nodeType?.display_field_slug &&
        node.data[nodeType.display_field_slug] != null
      ) {
        label = String(node.data[nodeType.display_field_slug])
      }

      const data: GraphNodeData = {
        label,
        color: nodeType?.color || '#6b7280',
        icon: nodeType?.icon || undefined,
        nodeTypeName: nodeType?.name || 'Unknown',
        fields: node.data,
        fieldMeta:
          nodeType?.fields?.map((f) => ({
            name: f.name,
            slug: f.slug,
            field_type: f.field_type,
          })) || [],
      }

      return {
        id: node.id,
        type: 'graphNode' as const,
        data,
        position: { x: 0, y: 0 }, // dagre will compute actual positions
      }
    })

    // Transform edges into React Flow edges
    const rfEdges: Edge<GraphEdgeData>[] = viewData.edges.map((edge) => {
      const edgeType = edgeTypeMap.get(edge.edge_type_id)

      // The `directed` field comes from SQLite as a number (0/1); coerce to boolean
      const directed = Boolean(edgeType?.directed)

      const data: GraphEdgeData = {
        directed,
        edgeTypeName: edgeType?.name || 'Unknown',
        fields: edge.data,
        fieldMeta:
          edgeType?.fields?.map((f) => ({
            name: f.name,
            slug: f.slug,
            field_type: f.field_type,
          })) || [],
      }

      return {
        id: edge.id,
        source: edge.source_node_id,
        target: edge.target_node_id,
        type: 'graphEdge' as const,
        data,
        ...(directed
          ? {
              markerEnd: {
                type: MarkerType.ArrowClosed,
                width: 16,
                height: 16,
                color: '#94a3b8',
              },
            }
          : {}),
      }
    })

    // Run dagre layout to compute node positions
    return getLayoutedElements(rfNodes, rfEdges)
  }, [viewData])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Controls />
      <MiniMap />
      <Background />
    </ReactFlow>
  )
}
