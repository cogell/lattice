import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { edgeTypeKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { EdgeType, NodeType } from '@lattice/shared'

interface EditEdgeTypeDialogProps {
  graphId: string
  edgeType: EdgeType
  nodeTypes: NodeType[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditEdgeTypeDialog({
  graphId,
  edgeType,
  nodeTypes,
  open,
  onOpenChange,
}: EditEdgeTypeDialogProps) {
  const [name, setName] = useState(edgeType.name)
  const [directed, setDirected] = useState(Boolean(edgeType.directed))
  const queryClient = useQueryClient()

  useEffect(() => {
    if (open) {
      setName(edgeType.name)
      setDirected(Boolean(edgeType.directed))
    }
  }, [open, edgeType])

  const updateEdgeType = useMutation({
    mutationFn: () =>
      api.updateEdgeType(graphId, edgeType.id, { name, directed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: edgeTypeKeys.list(graphId) })
      onOpenChange(false)
    },
  })

  const sourceNodeType = nodeTypes.find(
    (nt) => nt.id === edgeType.source_node_type_id,
  )
  const targetNodeType = nodeTypes.find(
    (nt) => nt.id === edgeType.target_node_type_id,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Edge Type</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            updateEdgeType.mutate()
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="edit-et-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="edit-et-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="edit-et-directed"
              type="checkbox"
              checked={directed}
              onChange={(e) => setDirected(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="edit-et-directed" className="text-sm font-medium">
              Directed
            </label>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="text-xs font-medium text-muted-foreground">
              Source &amp; target are fixed after creation
            </p>
            <p className="mt-1">
              {sourceNodeType?.name ?? 'Unknown'} &rarr;{' '}
              {targetNodeType?.name ?? 'Unknown'}
            </p>
          </div>
          {updateEdgeType.isError && (
            <p className="text-sm text-destructive">
              {updateEdgeType.error instanceof Error
                ? updateEdgeType.error.message
                : 'Failed to update edge type'}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={updateEdgeType.isPending}>
              {updateEdgeType.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
