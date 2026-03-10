import { useState } from 'react'
import { useCreateNode } from '@/hooks/use-nodes'
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
import type { NodeTypeField, NodeType } from '@lattice/shared'

interface CreateNodeDialogProps {
  graphId: string
  nodeType: NodeType
  fields: NodeTypeField[]
  children: React.ReactElement
}

export function CreateNodeDialog({
  graphId,
  nodeType,
  fields,
  children,
}: CreateNodeDialogProps) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<Record<string, unknown>>({})
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const createNode = useCreateNode(graphId)

  const sortedFields = [...fields].sort((a, b) => a.ordinal - b.ordinal)

  function resetForm() {
    setData({})
    setValidationErrors({})
  }

  function validate(): boolean {
    const errors: Record<string, string> = {}
    for (const field of sortedFields) {
      if (field.required) {
        const val = data[field.slug]
        if (val === undefined || val === null || val === '') {
          errors[field.slug] = `${field.name} is required`
        }
      }
    }
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    // Clean out undefined values
    const cleanData: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && val !== '') {
        cleanData[key] = val
      }
    }

    createNode.mutate(
      { node_type_id: nodeType.id, data: cleanData },
      {
        onSuccess: () => {
          setOpen(false)
          resetForm()
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) resetForm()
      }}
    >
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {nodeType.name}</DialogTitle>
          <DialogDescription>
            Create a new {nodeType.name.toLowerCase()} node.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          {sortedFields.map((field) => (
            <div key={field.id} className="space-y-1.5">
              <label htmlFor={`field-${field.slug}`} className="text-sm font-medium">
                {field.name}
                {field.required && <span className="ml-0.5 text-destructive">*</span>}
              </label>
              <FieldInput
                field={field}
                value={data[field.slug]}
                onChange={(val) =>
                  setData((prev) => ({ ...prev, [field.slug]: val }))
                }
              />
              {validationErrors[field.slug] && (
                <p className="text-xs text-destructive">
                  {validationErrors[field.slug]}
                </p>
              )}
            </div>
          ))}

          {sortedFields.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This node type has no fields defined yet.
            </p>
          )}

          {createNode.isError && (
            <p className="text-sm text-destructive">
              {createNode.error instanceof Error
                ? createNode.error.message
                : 'Failed to create node'}
            </p>
          )}

          <DialogFooter>
            <Button type="submit" disabled={createNode.isPending}>
              {createNode.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
