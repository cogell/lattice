import { useDeleteNode } from '@/hooks/use-nodes'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Node as GraphNode } from '@lattice/shared'

interface DeleteNodeDialogProps {
  graphId: string
  node: GraphNode
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteNodeDialog({
  graphId,
  node,
  open,
  onOpenChange,
}: DeleteNodeDialogProps) {
  const deleteNode = useDeleteNode(graphId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete node?</DialogTitle>
          <DialogDescription>
            This will permanently delete this node and all connected edges. This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {deleteNode.isError && (
          <p className="text-sm text-destructive">
            {deleteNode.error instanceof Error
              ? deleteNode.error.message
              : 'Failed to delete node'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              deleteNode.mutate(
                { nodeId: node.id, nodeTypeId: node.node_type_id },
                { onSuccess: () => onOpenChange(false) },
              )
            }
            disabled={deleteNode.isPending}
          >
            {deleteNode.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
