import { memo, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { LucideIcon } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { formatFieldValue, type FieldMeta } from '@/lib/format-field'

export type { FieldMeta }

export type GraphNodeData = {
  label: string
  color: string
  icon?: string
  nodeTypeName: string
  /** Actual field values keyed by field slug. */
  fields?: Record<string, unknown>
  /** Field definitions used for labeling and formatting in the tooltip. */
  fieldMeta?: FieldMeta[]
  [key: string]: unknown
}

export type GraphNodeType = Node<GraphNodeData, 'graphNode'>

/** Resolve a lucide icon name string (kebab-case or snake_case) to a component. */
function resolveLucideIcon(name?: string): LucideIcon | null {
  if (!name) return null
  // Convert kebab-case or snake_case to PascalCase
  const pascalName = name
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
  const icon = (LucideIcons as Record<string, unknown>)[pascalName]
  return typeof icon === 'function' ? (icon as LucideIcon) : null
}

function GraphNodeComponent({ data }: NodeProps<GraphNodeType>) {
  const Icon = resolveLucideIcon(data.icon)
  const [hovered, setHovered] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top })
    setHovered(true)
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHovered(false)
    setTooltipPos(null)
  }, [])

  const hasFieldData = data.fieldMeta && data.fieldMeta.length > 0 && data.fields

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />
      <div
        className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-sm"
        style={{ borderLeftWidth: 4, borderLeftColor: data.color || '#6b7280' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {Icon && (
          <Icon
            className="h-4 w-4 shrink-0"
            style={{ color: data.color || '#6b7280' }}
          />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{data.label}</div>
          <div className="truncate text-xs text-muted-foreground">{data.nodeTypeName}</div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
      {hovered && hasFieldData && tooltipPos &&
        createPortal(
          <NodeTooltip
            nodeTypeName={data.nodeTypeName}
            fields={data.fields!}
            fieldMeta={data.fieldMeta!}
            x={tooltipPos.x}
            y={tooltipPos.y}
          />,
          document.body,
        )}
    </>
  )
}

/** Tooltip rendered via portal showing all field values for a node. */
function NodeTooltip({
  nodeTypeName,
  fields,
  fieldMeta,
  x,
  y,
}: {
  nodeTypeName: string
  fields: Record<string, unknown>
  fieldMeta: FieldMeta[]
  x: number
  y: number
}) {
  return (
    <div
      className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md"
      style={{ left: x, top: y - 8 }}
    >
      <div className="mb-1 text-xs font-semibold">{nodeTypeName}</div>
      <dl className="space-y-0.5">
        {fieldMeta.map((meta) => (
          <div key={meta.slug} className="flex gap-2 text-xs">
            <dt className="shrink-0 font-medium text-muted-foreground">{meta.name}:</dt>
            <dd className="truncate">{formatFieldValue(fields[meta.slug], meta.field_type)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export const GraphNode = memo(GraphNodeComponent)
