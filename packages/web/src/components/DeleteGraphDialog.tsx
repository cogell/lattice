import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { graphKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Graph } from '@lattice/shared'

interface DeleteGraphDialogProps {
  graph: Graph
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeleteGraphDialog({ graph, open, onOpenChange }: DeleteGraphDialogProps) {
  const queryClient = useQueryClient()

  const deleteGraph = useMutation({
    mutationFn: () => api.deleteGraph(graph.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: graphKeys.all })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {graph.name}?</DialogTitle>
          <DialogDescription>
            This will permanently delete all node types, edge types, nodes, and edges. This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {deleteGraph.isError && (
          <p className="text-sm text-destructive">
            {deleteGraph.error instanceof Error
              ? deleteGraph.error.message
              : 'Failed to delete graph'}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => deleteGraph.mutate()}
            disabled={deleteGraph.isPending}
          >
            {deleteGraph.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
