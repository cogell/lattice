import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Field, NodeTypeField, EdgeTypeField } from '@lattice/shared'

type FieldDef = Field | NodeTypeField | EdgeTypeField

interface FieldInputProps {
  field: FieldDef
  value: unknown
  onChange: (value: unknown) => void
  className?: string
  autoFocus?: boolean
  onKeyDown?: React.KeyboardEventHandler
}

export function FieldInput({
  field,
  value,
  onChange,
  className,
  autoFocus,
  onKeyDown,
}: FieldInputProps) {
  const fieldType = field.field_type
  const config = field.config as Record<string, unknown>
  const options = (config?.options as string[]) ?? []

  switch (fieldType) {
    case 'text':
      return (
        <Input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={className}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
        />
      )

    case 'number':
      return (
        <Input
          type="number"
          value={value != null ? String(value) : ''}
          onChange={(e) => {
            const raw = e.target.value
            onChange(raw === '' ? null : Number(raw))
          }}
          className={className}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
        />
      )

    case 'boolean':
      return (
        <div className={cn('flex items-center', className)}>
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-border"
            autoFocus={autoFocus}
            onKeyDown={onKeyDown}
          />
        </div>
      )

    case 'date':
      return (
        <Input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={className}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
        />
      )

    case 'url':
      return (
        <Input
          type="url"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={className}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
        />
      )

    case 'email':
      return (
        <Input
          type="email"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={className}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
        />
      )

    case 'select':
      return (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'h-8 w-full rounded-md border border-border bg-background px-2 text-sm',
            className,
          )}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )

    case 'multi_select':
      return (
        <MultiSelectInput
          options={options}
          value={(value as string[]) ?? []}
          onChange={onChange}
          className={className}
        />
      )

    default:
      return (
        <Input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={className}
          autoFocus={autoFocus}
          onKeyDown={onKeyDown}
        />
      )
  }
}

interface MultiSelectInputProps {
  options: string[]
  value: string[]
  onChange: (value: unknown) => void
  className?: string
}

function MultiSelectInput({ options, value, onChange, className }: MultiSelectInputProps) {
  const [isOpen, setIsOpen] = useState(false)

  function handleToggle(opt: string) {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt))
    } else {
      onChange([...value, opt])
    }
  }

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 w-full items-center rounded-md border border-border bg-background px-2 text-left text-sm"
      >
        {value.length > 0 ? value.join(', ') : 'Select...'}
      </button>
      {isOpen && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-background shadow-md">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={value.includes(opt)}
                onChange={() => handleToggle(opt)}
                className="h-4 w-4 rounded border-border"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
