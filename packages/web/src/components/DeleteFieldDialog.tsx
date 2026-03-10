import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { nodeTypeFieldKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { NodeTypeField } from '@lattice/shared'

interface DeleteFieldDialogProps {
  graphId: string
  nodeTypeId: string
  field: NodeTypeField
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteFieldDialog({
  graphId,
  nodeTypeId,
  field,
  open,
  onOpenChange,
}: DeleteFieldDialogProps) {
  const queryClient = useQueryClient()

  const deleteField = useMutation({
    mutationFn: () => api.deleteNodeTypeField(graphId, nodeTypeId, field.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeTypeFieldKeys.list(graphId, nodeTypeId) })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {field.name}?</DialogTitle>
          <DialogDescription>
            Data in this field will be lost. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {deleteField.isError && (
          <p className="text-sm text-destructive">
            {deleteField.error instanceof Error
              ? deleteField.error.message
              : 'Failed to delete field'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteField.mutate()}
            disabled={deleteField.isPending}
          >
            {deleteField.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
