import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { nodeTypeKeys, nodeKeys } from '@/lib/query'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Node as LatticeNode } from '@lattice/shared'

interface NodePickerProps {
  graphId: string
  nodeTypeId: string
  value: string | null
  onChange: (nodeId: string | null) => void
  placeholder?: string
  className?: string
}

export function NodePicker({
  graphId,
  nodeTypeId,
  value,
  onChange,
  placeholder = 'Search nodes...',
  className,
}: NodePickerProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Fetch the node type to get display_field_slug
  const { data: nodeType } = useQuery({
    queryKey: nodeTypeKeys.detail(graphId, nodeTypeId),
    queryFn: () => api.getNodeType(graphId, nodeTypeId),
    enabled: !!nodeTypeId,
  })

  const displayFieldSlug = nodeType?.display_field_slug ?? null

  // Build filter for search
  const listOpts = (() => {
    if (!debouncedSearch.trim() || !displayFieldSlug) {
      return { limit: 20 }
    }
    return {
      limit: 20,
      filters: {
        [displayFieldSlug]: { contains: debouncedSearch.trim() },
      },
    }
  })()

  // Fetch matching nodes
  const { data: nodesResult, isLoading: nodesLoading } = useQuery({
    queryKey: [...nodeKeys.list(graphId, nodeTypeId), listOpts] as const,
    queryFn: () => api.listNodes(graphId, nodeTypeId, listOpts),
    enabled: !!nodeTypeId,
  })

  const nodes = nodesResult?.data ?? []

  // Fetch the currently selected node for display label
  const { data: selectedNode } = useQuery({
    queryKey: nodeKeys.detail(graphId, value ?? ''),
    queryFn: () => api.getNode(graphId, value!),
    enabled: !!value,
  })

  // Get display label for a node
  const getNodeLabel = useCallback(
    (node: LatticeNode): string => {
      if (displayFieldSlug && node.data[displayFieldSlug] != null) {
        return String(node.data[displayFieldSlug])
      }
      return node.id
    },
    [displayFieldSlug],
  )

  // Selected value display
  const selectedLabel = (() => {
    if (!value) return ''
    if (selectedNode) return getNodeLabel(selectedNode)
    return value
  })()

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <Input
        type="text"
        placeholder={placeholder}
        value={isOpen ? searchTerm : selectedLabel}
        onChange={(e) => {
          setSearchTerm(e.target.value)
          if (!isOpen) setIsOpen(true)
        }}
        onFocus={() => {
          setSearchTerm('')
          setIsOpen(true)
        }}
        className="w-full"
      />

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-background shadow-lg">
          {nodesLoading && (
            <div className="flex items-center justify-center px-3 py-2 text-sm text-muted-foreground">
              <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              Loading...
            </div>
          )}

          {!nodesLoading && nodes.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No nodes found.
            </div>
          )}

          {!nodesLoading && nodes.length > 0 && (
            <ul className="max-h-48 overflow-y-auto py-1">
              {nodes.map((node) => {
                const label = getNodeLabel(node)
                const isSelected = node.id === value
                return (
                  <li
                    key={node.id}
                    className={cn(
                      'cursor-pointer px-3 py-1.5 text-sm hover:bg-muted/50',
                      isSelected && 'bg-muted font-medium',
                    )}
                    onClick={() => {
                      onChange(node.id)
                      setSearchTerm('')
                      setIsOpen(false)
                    }}
                  >
                    {label}
                  </li>
                )
              })}
            </ul>
          )}

          {value && (
            <div className="border-t px-3 py-1.5">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onChange(null)
                  setSearchTerm('')
                  setIsOpen(false)
                }}
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
