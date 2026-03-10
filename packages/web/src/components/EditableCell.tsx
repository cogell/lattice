import { useState, useRef, useEffect, useCallback } from 'react'
import { FieldInput } from '@/components/FieldInput'
import type { Field, NodeTypeField, EdgeTypeField } from '@lattice/shared'

type FieldDef = Field | NodeTypeField | EdgeTypeField

interface EditableCellProps {
  field: FieldDef
  value: unknown
  onSave: (newValue: unknown) => void
  onCancel?: () => void
}

export function EditableCell({ field, value, onSave, onCancel }: EditableCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState<unknown>(value)
  const cellRef = useRef<HTMLDivElement>(null)

  // Sync editValue when value prop changes while not editing
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value)
    }
  }, [value, isEditing])

  const handleSave = useCallback(() => {
    setIsEditing(false)
    if (editValue !== value) {
      onSave(editValue)
    }
  }, [editValue, value, onSave])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setEditValue(value)
    onCancel?.()
  }, [value, onCancel])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSave()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleCancel()
      }
    },
    [handleSave, handleCancel],
  )

  // Handle click-outside to save
  useEffect(() => {
    if (!isEditing) return

    function handleClickOutside(e: MouseEvent) {
      if (cellRef.current && !cellRef.current.contains(e.target as Node)) {
        handleSave()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isEditing, handleSave])

  if (isEditing) {
    return (
      <div ref={cellRef} className="min-w-[120px]">
        <FieldInput
          field={field}
          value={editValue}
          onChange={setEditValue}
          autoFocus
          onKeyDown={handleKeyDown}
        />
      </div>
    )
  }

  return (
    <div
      className="cursor-pointer rounded px-1 py-0.5 hover:bg-muted/50"
      onClick={() => {
        setEditValue(value)
        setIsEditing(true)
      }}
      title="Click to edit"
    >
      {formatDisplayValue(field, value)}
    </div>
  )
}

function formatDisplayValue(field: FieldDef, value: unknown): string {
  if (value == null || value === '') return '\u2014'

  switch (field.field_type) {
    case 'boolean':
      return value ? 'Yes' : 'No'
    case 'multi_select':
      return Array.isArray(value) ? value.join(', ') : String(value)
    default:
      return String(value)
  }
}
