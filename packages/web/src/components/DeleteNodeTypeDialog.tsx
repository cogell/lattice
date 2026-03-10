import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { nodeTypeKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { NodeType } from '@lattice/shared'

interface DeleteNodeTypeDialogProps {
  graphId: string
  nodeType: NodeType
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteNodeTypeDialog({
  graphId,
  nodeType,
  open,
  onOpenChange,
}: DeleteNodeTypeDialogProps) {
  const queryClient = useQueryClient()

  const deleteNodeType = useMutation({
    mutationFn: () => api.deleteNodeType(graphId, nodeType.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeTypeKeys.list(graphId) })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {nodeType.name}?</DialogTitle>
          <DialogDescription>
            This will permanently delete all nodes of this type and their edges.
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {deleteNodeType.isError && (
          <p className="text-sm text-destructive">
            {deleteNodeType.error instanceof Error
              ? deleteNodeType.error.message
              : 'Failed to delete node type'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteNodeType.mutate()}
            disabled={deleteNodeType.isPending}
          >
            {deleteNodeType.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
