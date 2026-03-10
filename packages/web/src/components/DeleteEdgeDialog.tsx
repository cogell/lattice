import { useDeleteEdge } from '@/hooks/use-edges'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DeleteEdgeDialogProps {
  graphId: string
  edgeId: string
  edgeTypeId: string
  displayLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteEdgeDialog({
  graphId,
  edgeId,
  edgeTypeId,
  displayLabel,
  open,
  onOpenChange,
}: DeleteEdgeDialogProps) {
  const deleteEdge = useDeleteEdge(graphId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete edge?</DialogTitle>
          <DialogDescription>
            This will permanently delete the edge "{displayLabel}". This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        {deleteEdge.isError && (
          <p className="text-sm text-destructive">
            {deleteEdge.error instanceof Error
              ? deleteEdge.error.message
              : 'Failed to delete edge'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() =>
              deleteEdge.mutate(
                { edgeId, edgeTypeId },
                { onSuccess: () => onOpenChange(false) },
              )
            }
            disabled={deleteEdge.isPending}
          >
            {deleteEdge.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
