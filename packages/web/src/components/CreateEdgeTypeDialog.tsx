import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { edgeTypeKeys, nodeTypeKeys, viewDataKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function CreateEdgeTypeDialog({
  graphId,
  children,
}: {
  graphId: string
  children: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [directed, setDirected] = useState(true)
  const [sourceNodeTypeId, setSourceNodeTypeId] = useState('')
  const [targetNodeTypeId, setTargetNodeTypeId] = useState('')
  const queryClient = useQueryClient()

  const { data: nodeTypes } = useQuery({
    queryKey: nodeTypeKeys.list(graphId),
    queryFn: () => api.listNodeTypes(graphId),
  })

  const createEdgeType = useMutation({
    mutationFn: () =>
      api.createEdgeType(graphId, {
        name,
        directed,
        source_node_type_id: sourceNodeTypeId,
        target_node_type_id: targetNodeTypeId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: edgeTypeKeys.list(graphId) })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
      setOpen(false)
      setName('')
      setDirected(true)
      setSourceNodeTypeId('')
      setTargetNodeTypeId('')
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Edge Type</DialogTitle>
          <DialogDescription>
            Define a new type of edge to connect nodes in your graph.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createEdgeType.mutate()
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="et-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="et-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. knows, owns, belongs_to"
              required
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="et-directed"
              type="checkbox"
              checked={directed}
              onChange={(e) => setDirected(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="et-directed" className="text-sm font-medium">
              Directed
            </label>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="et-source" className="text-sm font-medium">
              Source Node Type
            </label>
            <select
              id="et-source"
              value={sourceNodeTypeId}
              onChange={(e) => setSourceNodeTypeId(e.target.value)}
              required
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Select a node type...</option>
              {nodeTypes?.map((nt) => (
                <option key={nt.id} value={nt.id}>
                  {nt.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="et-target" className="text-sm font-medium">
              Target Node Type
            </label>
            <select
              id="et-target"
              value={targetNodeTypeId}
              onChange={(e) => setTargetNodeTypeId(e.target.value)}
              required
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">Select a node type...</option>
              {nodeTypes?.map((nt) => (
                <option key={nt.id} value={nt.id}>
                  {nt.name}
                </option>
              ))}
            </select>
          </div>
          {createEdgeType.isError && (
            <p className="text-sm text-destructive">
              {createEdgeType.error instanceof Error
                ? createEdgeType.error.message
                : 'Failed to create edge type'}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={createEdgeType.isPending}>
              {createEdgeType.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
