import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { graphKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Graph } from '@lattice/shared'

interface EditGraphDialogProps {
  graph: Graph
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditGraphDialog({ graph, open, onOpenChange }: EditGraphDialogProps) {
  const [name, setName] = useState(graph.name)
  const [description, setDescription] = useState(graph.description ?? '')
  const queryClient = useQueryClient()

  useEffect(() => {
    if (open) {
      setName(graph.name)
      setDescription(graph.description ?? '')
    }
  }, [open, graph])

  const updateGraph = useMutation({
    mutationFn: () =>
      api.updateGraph(graph.id, { name, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: graphKeys.all })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Graph</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            updateGraph.mutate()
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="edit-graph-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="edit-graph-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-graph-desc" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="edit-graph-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          {updateGraph.isError && (
            <p className="text-sm text-destructive">
              {updateGraph.error instanceof Error
                ? updateGraph.error.message
                : 'Failed to update graph'}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={updateGraph.isPending}>
              {updateGraph.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
