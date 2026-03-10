import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { nodeTypeFieldKeys, viewDataKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { CreateFieldDialog } from '@/components/CreateFieldDialog'
import { EditFieldDialog } from '@/components/EditFieldDialog'
import { DeleteFieldDialog } from '@/components/DeleteFieldDialog'
import { ArrowDown, ArrowUp, Plus, Pencil, Trash2 } from 'lucide-react'
import type { NodeTypeField } from '@lattice/shared'

interface NodeTypeFieldListProps {
  graphId: string
  nodeTypeId: string
}

export function NodeTypeFieldList({ graphId, nodeTypeId }: NodeTypeFieldListProps) {
  const queryClient = useQueryClient()
  const { data: fields, isLoading } = useQuery({
    queryKey: nodeTypeFieldKeys.list(graphId, nodeTypeId),
    queryFn: () => api.listNodeTypeFields(graphId, nodeTypeId),
  })

  const sortedFields = [...(fields ?? [])].sort((a, b) => a.ordinal - b.ordinal)

  const reorder = useMutation({
    mutationFn: async (swaps: { fieldId: string; newOrdinal: number }[]) => {
      await Promise.all(
        swaps.map((s) => api.updateNodeTypeField(graphId, nodeTypeId, s.fieldId, { ordinal: s.newOrdinal })),
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeTypeFieldKeys.list(graphId, nodeTypeId) })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
    },
  })

  function handleMove(index: number, direction: 'up' | 'down') {
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= sortedFields.length) return

    const field = sortedFields[index]
    const swapField = sortedFields[swapIndex]

    reorder.mutate([
      { fieldId: field.id, newOrdinal: swapField.ordinal },
      { fieldId: swapField.id, newOrdinal: field.ordinal },
    ])
  }

  if (isLoading) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">Loading fields...</p>
    )
  }

  return (
    <div className="space-y-1 border-t px-3 pb-3 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Fields</p>
        <CreateFieldDialog
          graphId={graphId}
          nodeTypeId={nodeTypeId}
          fieldCount={sortedFields.length}
        >
          <Button variant="ghost" size="icon-xs">
            <Plus className="h-3 w-3" />
          </Button>
        </CreateFieldDialog>
      </div>
      {sortedFields.length === 0 ? (
        <p className="text-xs text-muted-foreground">No fields yet.</p>
      ) : (
        <div className="space-y-1">
          {sortedFields.map((field, index) => (
            <FieldRow
              key={field.id}
              graphId={graphId}
              nodeTypeId={nodeTypeId}
              field={field}
              isFirst={index === 0}
              isLast={index === sortedFields.length - 1}
              onMoveUp={() => handleMove(index, 'up')}
              onMoveDown={() => handleMove(index, 'down')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FieldRow({
  graphId,
  nodeTypeId,
  field,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  graphId: string
  nodeTypeId: string
  field: NodeTypeField
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <div className="group flex items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="text-sm">{field.name}</span>
          {field.required && (
            <span className="text-xs text-destructive">*</span>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {field.field_type}
          </span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onMoveUp}
            disabled={isFirst}
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onMoveDown}
            disabled={isLast}
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <EditFieldDialog
        graphId={graphId}
        nodeTypeId={nodeTypeId}
        field={field}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteFieldDialog
        graphId={graphId}
        nodeTypeId={nodeTypeId}
        field={field}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  )
}
