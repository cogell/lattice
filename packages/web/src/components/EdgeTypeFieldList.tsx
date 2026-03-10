import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { edgeTypeFieldKeys, viewDataKeys } from '@/lib/query'
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
import { ArrowDown, ArrowUp, Plus, Pencil, Trash2, X } from 'lucide-react'
import type { EdgeTypeField } from '@lattice/shared'

interface EdgeTypeFieldListProps {
  graphId: string
  edgeTypeId: string
}

export function EdgeTypeFieldList({ graphId, edgeTypeId }: EdgeTypeFieldListProps) {
  const queryClient = useQueryClient()
  const { data: fields, isLoading } = useQuery({
    queryKey: edgeTypeFieldKeys.list(graphId, edgeTypeId),
    queryFn: () => api.listEdgeTypeFields(graphId, edgeTypeId),
  })

  const sortedFields = [...(fields ?? [])].sort((a, b) => a.ordinal - b.ordinal)

  const reorder = useMutation({
    mutationFn: async (swaps: { fieldId: string; newOrdinal: number }[]) => {
      await Promise.all(
        swaps.map((s) => api.updateEdgeTypeField(graphId, edgeTypeId, s.fieldId, { ordinal: s.newOrdinal })),
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: edgeTypeFieldKeys.list(graphId, edgeTypeId) })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
    },
  })

  function handleMove(index: number, direction: 'up' | 'down') {
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= sortedFields.length) return

    const field = sortedFields[index]
    const swapField = sortedFields[swapIndex]

    reorder.mutate([
      { fieldId: field.id, newOrdinal: swapField.ordinal },
      { fieldId: swapField.id, newOrdinal: field.ordinal },
    ])
  }

  if (isLoading) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">Loading fields...</p>
    )
  }

  return (
    <div className="space-y-1 border-t px-3 pb-3 pt-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Fields</p>
        <CreateEdgeFieldDialog
          graphId={graphId}
          edgeTypeId={edgeTypeId}
          fieldCount={sortedFields.length}
        >
          <Button variant="ghost" size="icon-xs">
            <Plus className="h-3 w-3" />
          </Button>
        </CreateEdgeFieldDialog>
      </div>
      {sortedFields.length === 0 ? (
        <p className="text-xs text-muted-foreground">No fields yet.</p>
      ) : (
        <div className="space-y-1">
          {sortedFields.map((field, index) => (
            <EdgeFieldRow
              key={field.id}
              graphId={graphId}
              edgeTypeId={edgeTypeId}
              field={field}
              isFirst={index === 0}
              isLast={index === sortedFields.length - 1}
              onMoveUp={() => handleMove(index, 'up')}
              onMoveDown={() => handleMove(index, 'down')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EdgeFieldRow({
  graphId,
  edgeTypeId,
  field,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
}: {
  graphId: string
  edgeTypeId: string
  field: EdgeTypeField
  isFirst: boolean
  isLast: boolean
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <div className="group flex items-center justify-between rounded-md px-2 py-1 transition-colors hover:bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="text-sm">{field.name}</span>
          {field.required && (
            <span className="text-xs text-destructive">*</span>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {field.field_type}
          </span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onMoveUp}
            disabled={isFirst}
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onMoveDown}
            disabled={isLast}
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <EditEdgeFieldDialog
        graphId={graphId}
        edgeTypeId={edgeTypeId}
        field={field}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteEdgeFieldDialog
        graphId={graphId}
        edgeTypeId={edgeTypeId}
        field={field}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  )
}

// --- Create Edge Field Dialog ---

function CreateEdgeFieldDialog({
  graphId,
  edgeTypeId,
  fieldCount,
  children,
}: {
  graphId: string
  edgeTypeId: string
  fieldCount: number
  children: React.ReactElement
}) {
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
      api.createEdgeTypeField(graphId, edgeTypeId, {
        name,
        field_type: fieldType as (typeof FIELD_TYPES)[number],
        ordinal: fieldCount,
        required,
        config: hasOptions ? { options } : {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: edgeTypeFieldKeys.list(graphId, edgeTypeId) })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
      setOpen(false)
      setName('')
      setFieldType('text')
      setRequired(false)
      setOptions([])
      setNewOption('')
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Field</DialogTitle>
          <DialogDescription>
            Add a new field to this edge type.
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
            <label htmlFor="edge-field-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="edge-field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Field name"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="edge-field-type" className="text-sm font-medium">
              Type
            </label>
            <select
              id="edge-field-type"
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
              id="edge-field-required"
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="edge-field-required" className="text-sm font-medium">
              Required
            </label>
          </div>
          {hasOptions && (
            <OptionsEditor
              options={options}
              newOption={newOption}
              onNewOptionChange={setNewOption}
              onAddOption={handleAddOption}
              onEditOption={handleEditOption}
              onRemoveOption={handleRemoveOption}
            />
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

// --- Edit Edge Field Dialog ---

function EditEdgeFieldDialog({
  graphId,
  edgeTypeId,
  field,
  open,
  onOpenChange,
}: {
  graphId: string
  edgeTypeId: string
  field: EdgeTypeField
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
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
      api.updateEdgeTypeField(graphId, edgeTypeId, field.id, {
        name,
        required,
        config: hasOptions ? { options } : {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: edgeTypeFieldKeys.list(graphId, edgeTypeId) })
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
            <label htmlFor="edit-edge-field-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="edit-edge-field-name"
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
              id="edit-edge-field-required"
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="edit-edge-field-required" className="text-sm font-medium">
              Required
            </label>
          </div>
          {hasOptions && (
            <OptionsEditor
              options={options}
              newOption={newOption}
              onNewOptionChange={setNewOption}
              onAddOption={handleAddOption}
              onEditOption={handleEditOption}
              onRemoveOption={handleRemoveOption}
            />
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

// --- Delete Edge Field Dialog ---

function DeleteEdgeFieldDialog({
  graphId,
  edgeTypeId,
  field,
  open,
  onOpenChange,
}: {
  graphId: string
  edgeTypeId: string
  field: EdgeTypeField
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()

  const deleteField = useMutation({
    mutationFn: () => api.deleteEdgeTypeField(graphId, edgeTypeId, field.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: edgeTypeFieldKeys.list(graphId, edgeTypeId) })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
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

// --- Shared Options Editor ---

function OptionsEditor({
  options,
  newOption,
  onNewOptionChange,
  onAddOption,
  onEditOption,
  onRemoveOption,
}: {
  options: string[]
  newOption: string
  onNewOptionChange: (v: string) => void
  onAddOption: () => void
  onEditOption: (index: number, value: string) => void
  onRemoveOption: (index: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">Options</label>
      {options.length > 0 && (
        <div className="space-y-1">
          {options.map((opt, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Input
                value={opt}
                onChange={(e) => onEditOption(i, e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onRemoveOption(i)}
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
          onChange={(e) => onNewOptionChange(e.target.value)}
          placeholder="Add option..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onAddOption()
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={onAddOption}>
          Add
        </Button>
      </div>
      {options.length === 0 && (
        <p className="text-xs text-muted-foreground">
          At least one option is required.
        </p>
      )}
    </div>
  )
}
