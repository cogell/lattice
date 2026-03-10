import { useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { nodeTypeKeys, nodeTypeFieldKeys, viewDataKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { NodeType } from '@lattice/shared'

interface EditNodeTypeDialogProps {
  graphId: string
  nodeType: NodeType
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditNodeTypeDialog({
  graphId,
  nodeType,
  open,
  onOpenChange,
}: EditNodeTypeDialogProps) {
  const [name, setName] = useState(nodeType.name)
  const [color, setColor] = useState(nodeType.color ?? '#78716c')
  const [icon, setIcon] = useState(nodeType.icon ?? '')
  const [displayFieldSlug, setDisplayFieldSlug] = useState(nodeType.display_field_slug ?? '')
  const queryClient = useQueryClient()

  const { data: fields } = useQuery({
    queryKey: nodeTypeFieldKeys.list(graphId, nodeType.id),
    queryFn: () => api.listNodeTypeFields(graphId, nodeType.id),
    enabled: open,
  })

  useEffect(() => {
    if (open) {
      setName(nodeType.name)
      setColor(nodeType.color ?? '#78716c')
      setIcon(nodeType.icon ?? '')
      setDisplayFieldSlug(nodeType.display_field_slug ?? '')
    }
  }, [open, nodeType])

  const updateNodeType = useMutation({
    mutationFn: () =>
      api.updateNodeType(graphId, nodeType.id, {
        name,
        color: color || null,
        icon: icon || null,
        display_field_slug: displayFieldSlug || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeTypeKeys.list(graphId) })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
      onOpenChange(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Node Type</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            updateNodeType.mutate()
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="edit-nt-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="edit-nt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-nt-color" className="text-sm font-medium">
              Color
            </label>
            <div className="flex items-center gap-2">
              <input
                id="edit-nt-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded border border-border"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-nt-icon" className="text-sm font-medium">
              Icon
            </label>
            <Input
              id="edit-nt-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="circle"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edit-nt-display-field" className="text-sm font-medium">
              Display Field
            </label>
            <select
              id="edit-nt-display-field"
              value={displayFieldSlug}
              onChange={(e) => setDisplayFieldSlug(e.target.value)}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="">None</option>
              {(fields ?? []).map((f) => (
                <option key={f.id} value={f.slug}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          {updateNodeType.isError && (
            <p className="text-sm text-destructive">
              {updateNodeType.error instanceof Error
                ? updateNodeType.error.message
                : 'Failed to update node type'}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={updateNodeType.isPending}>
              {updateNodeType.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
