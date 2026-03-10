import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { edgeTypeKeys, viewDataKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { EdgeType } from '@lattice/shared'

interface DeleteEdgeTypeDialogProps {
  graphId: string
  edgeType: EdgeType
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteEdgeTypeDialog({
  graphId,
  edgeType,
  open,
  onOpenChange,
}: DeleteEdgeTypeDialogProps) {
  const queryClient = useQueryClient()

  const deleteEdgeType = useMutation({
    mutationFn: () => api.deleteEdgeType(graphId, edgeType.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: edgeTypeKeys.list(graphId) })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {edgeType.name}?</DialogTitle>
          <DialogDescription>
            This will permanently delete all edges of this type. This action
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {deleteEdgeType.isError && (
          <p className="text-sm text-destructive">
            {deleteEdgeType.error instanceof Error
              ? deleteEdgeType.error.message
              : 'Failed to delete edge type'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteEdgeType.mutate()}
            disabled={deleteEdgeType.isPending}
          >
            {deleteEdgeType.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
