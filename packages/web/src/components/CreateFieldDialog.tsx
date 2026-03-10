import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { nodeTypeFieldKeys } from '@/lib/query'
import { FIELD_TYPES } from '@lattice/shared'
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
import { X } from 'lucide-react'

interface CreateFieldDialogProps {
  graphId: string
  nodeTypeId: string
  fieldCount: number
  children: React.ReactElement
}

export function CreateFieldDialog({
  graphId,
  nodeTypeId,
  fieldCount,
  children,
}: CreateFieldDialogProps) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [fieldType, setFieldType] = useState<string>('text')
  const [required, setRequired] = useState(false)
  const [options, setOptions] = useState<string[]>([])
  const [newOption, setNewOption] = useState('')
  const queryClient = useQueryClient()

  const hasOptions = fieldType === 'select' || fieldType === 'multi_select'

  const createField = useMutation({
    mutationFn: () =>
      api.createNodeTypeField(graphId, nodeTypeId, {
        name,
        field_type: fieldType as (typeof FIELD_TYPES)[number],
        ordinal: fieldCount,
        required,
        config: hasOptions ? { options } : {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeTypeFieldKeys.list(graphId, nodeTypeId) })
      setOpen(false)
      setName('')
      setFieldType('text')
      setRequired(false)
      setOptions([])
      setNewOption('')
    },
  })

  const canSubmit = name.trim() && (!hasOptions || options.length > 0)

  function handleAddOption() {
    const trimmed = newOption.trim()
    if (trimmed && !options.includes(trimmed)) {
      setOptions([...options, trimmed])
      setNewOption('')
    }
  }

  function handleRemoveOption(index: number) {
    setOptions(options.filter((_, i) => i !== index))
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Field</DialogTitle>
          <DialogDescription>
            Add a new field to this node type.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) createField.mutate()
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="field-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Field name"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="field-type" className="text-sm font-medium">
              Type
            </label>
            <select
              id="field-type"
              value={fieldType}
              onChange={(e) => {
                setFieldType(e.target.value)
                if (e.target.value !== 'select' && e.target.value !== 'multi_select') {
                  setOptions([])
                }
              }}
              className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {ft}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="field-required"
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="field-required" className="text-sm font-medium">
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
                      <span className="flex-1 rounded-md border border-border bg-muted/50 px-2 py-1 text-sm">
                        {opt}
                      </span>
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
          {createField.isError && (
            <p className="text-sm text-destructive">
              {createField.error instanceof Error
                ? createField.error.message
                : 'Failed to create field'}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={createField.isPending || !canSubmit}>
              {createField.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
