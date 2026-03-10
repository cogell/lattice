import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { nodeTypeFieldKeys, viewDataKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { X } from 'lucide-react'
import type { NodeTypeField } from '@lattice/shared'

interface EditFieldDialogProps {
  graphId: string
  nodeTypeId: string
  field: NodeTypeField
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditFieldDialog({
  graphId,
  nodeTypeId,
  field,
  open,
  onOpenChange,
}: EditFieldDialogProps) {
  const [name, setName] = useState(field.name)
  const [required, setRequired] = useState(!!field.required)
  const [options, setOptions] = useState<string[]>(
    (field.config as Record<string, unknown>)?.options as string[] ?? [],
  )
  const [newOption, setNewOption] = useState('')
  const queryClient = useQueryClient()

  const hasOptions = field.field_type === 'select' || field.field_type === 'multi_select'

  useEffect(() => {
    if (open) {
      setName(field.name)
      setRequired(!!field.required)
      setOptions(
        (field.config as Record<string, unknown>)?.options as string[] ?? [],
      )
      setNewOption('')
    }
  }, [open, field])

  const updateField = useMutation({
    mutationFn: () =>
      api.updateNodeTypeField(graphId, nodeTypeId, field.id, {
        name,
        required,
        config: hasOptions ? { options } : {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeTypeFieldKeys.list(graphId, nodeTypeId) })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
      onOpenChange(false)
    },
  })

  const canSubmit = name.trim() && (!hasOptions || (options.length > 0 && options.every(o => o.trim())))

  function handleAddOption() {
    const trimmed = newOption.trim()
    if (trimmed && !options.includes(trimmed)) {
      setOptions([...options, trimmed])
      setNewOption('')
    }
  }

  function handleEditOption(index: number, value: string) {
    setOptions(options.map((o, i) => (i === index ? value : o)))
  }

  function handleRemoveOption(index: number) {
    setOptions(options.filter((_, i) => i !== index))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Field</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) updateField.mutate()
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="edit-field-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="edit-field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <p className="text-sm text-muted-foreground">{field.field_type}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="edit-field-required"
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="edit-field-required" className="text-sm font-medium">
              Required
            </label>
          </div>
          {hasOptions && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Options</label>
              {options.length > 0 && (
                <div className="space-y-1">
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        value={opt}
                        onChange={(e) => handleEditOption(i, e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleRemoveOption(i)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Input
                  value={newOption}
                  onChange={(e) => setNewOption(e.target.value)}
                  placeholder="Add option..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddOption()
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleAddOption}>
                  Add
                </Button>
              </div>
              {hasOptions && options.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  At least one option is required.
                </p>
              )}
            </div>
          )}
          {updateField.isError && (
            <p className="text-sm text-destructive">
              {updateField.error instanceof Error
                ? updateField.error.message
                : 'Failed to update field'}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={updateField.isPending || !canSubmit}>
              {updateField.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
