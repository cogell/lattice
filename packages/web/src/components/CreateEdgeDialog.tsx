import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { edgeTypeFieldKeys } from '@/lib/query'
import { useCreateEdge } from '@/hooks/use-edges'
import { NodePicker } from '@/components/NodePicker'
import { FieldInput } from '@/components/FieldInput'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { EdgeType } from '@lattice/shared'

interface CreateEdgeDialogProps {
  graphId: string
  edgeType: EdgeType
  children: React.ReactElement
}

export function CreateEdgeDialog({ graphId, edgeType, children }: CreateEdgeDialogProps) {
  const [open, setOpen] = useState(false)
  const [sourceNodeId, setSourceNodeId] = useState<string | null>(null)
  const [targetNodeId, setTargetNodeId] = useState<string | null>(null)
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({})

  const createEdge = useCreateEdge(graphId)

  // Fetch edge type fields for the form
  const { data: fields } = useQuery({
    queryKey: edgeTypeFieldKeys.list(graphId, edgeType.id),
    queryFn: () => api.listEdgeTypeFields(graphId, edgeType.id),
    enabled: open,
  })

  const sortedFields = fields ? [...fields].sort((a, b) => a.ordinal - b.ordinal) : []

  function resetForm() {
    setSourceNodeId(null)
    setTargetNodeId(null)
    setFieldValues({})
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      resetForm()
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!sourceNodeId || !targetNodeId) return

    createEdge.mutate(
      {
        edge_type_id: edgeType.id,
        source_node_id: sourceNodeId,
        target_node_id: targetNodeId,
        data: fieldValues,
      },
      {
        onSuccess: () => {
          handleOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {edgeType.name} Edge</DialogTitle>
          <DialogDescription>
            Select source and target nodes, then fill in any edge data fields.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Source Node <span className="text-destructive">*</span>
            </label>
            <NodePicker
              graphId={graphId}
              nodeTypeId={edgeType.source_node_type_id}
              value={sourceNodeId}
              onChange={setSourceNodeId}
              placeholder="Search source nodes..."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Target Node <span className="text-destructive">*</span>
            </label>
            <NodePicker
              graphId={graphId}
              nodeTypeId={edgeType.target_node_type_id}
              value={targetNodeId}
              onChange={setTargetNodeId}
              placeholder="Search target nodes..."
            />
          </div>

          {sortedFields.map((field) => (
            <div key={field.id} className="space-y-1.5">
              <label className="text-sm font-medium">
                {field.name}
                {field.required && <span className="text-destructive"> *</span>}
              </label>
              <FieldInput
                field={field}
                value={fieldValues[field.slug] ?? null}
                onChange={(val) =>
                  setFieldValues((prev) => ({ ...prev, [field.slug]: val }))
                }
              />
            </div>
          ))}

          {createEdge.isError && (
            <p className="text-sm text-destructive">
              {createEdge.error instanceof Error
                ? createEdge.error.message
                : 'Failed to create edge'}
            </p>
          )}

          <DialogFooter>
            <Button
              type="submit"
              disabled={createEdge.isPending || !sourceNodeId || !targetNodeId}
            >
              {createEdge.isPending ? 'Creating...' : 'Create Edge'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
