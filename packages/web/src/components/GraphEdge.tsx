import { memo, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
  type Edge,
} from '@xyflow/react'
import { formatFieldValue, type FieldMeta } from '@/lib/format-field'

export interface GraphEdgeData extends Record<string, unknown> {
  directed: boolean
  edgeTypeName: string
  /** Edge type color for stroke rendering; falls back to #94a3b8 */
  color?: string
  /** Actual field values keyed by slug */
  fields: Record<string, unknown>
  /** Field definitions for displaying human-readable labels */
  fieldMeta: FieldMeta[]
}

export type GraphEdgeType = Edge<GraphEdgeData, 'graphEdge'>

function GraphEdgeComponent({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps<GraphEdgeType>) {
  const [hovered, setHovered] = useState(false)

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  })

  const midX = (sourceX + targetX) / 2
  const midY = (sourceY + targetY) / 2

  const edgeTypeName = data?.edgeTypeName ?? 'Edge'
  const directed = data?.directed ?? false
  const edgeColor = data?.color ?? '#94a3b8'
  const fields = data?.fields ?? {}
  const fieldMeta = data?.fieldMeta ?? []

  return (
    <>
      {/* Invisible wider path for hover detection */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={20}
        stroke="transparent"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          strokeWidth: 1.5,
          stroke: edgeColor,
          ...style,
        }}
        interactionWidth={20}
      />
      {hovered && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -100%) translate(${midX}px, ${midY}px)`,
              pointerEvents: 'all',
            }}
            className="z-50 min-w-[160px] max-w-[280px] rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: edgeColor }}
              />
              <span className="text-sm font-semibold">{edgeTypeName}</span>
              <span className="text-xs text-muted-foreground">
                {directed ? '(directed)' : '(undirected)'}
              </span>
            </div>
            {fieldMeta.length > 0 && (
              <div className="mt-1 flex flex-col gap-1 border-t pt-1.5">
                {fieldMeta.map((fm) => (
                  <div key={fm.slug} className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{fm.name}</span>
                    <span className="truncate text-xs font-medium">
                      {formatFieldValue(fields[fm.slug], fm.field_type)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export const GraphEdge = memo(GraphEdgeComponent)
