import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, useCallback } from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { api } from '@/lib/api'
import { edgeTypeKeys, edgeTypeFieldKeys, edgeKeys, nodeTypeKeys } from '@/lib/query'
import { useEdges, useUpdateEdge } from '@/hooks/use-edges'
import { useBatchNodes } from '@/hooks/use-nodes'
import { DataTable } from '@/components/DataTable'
import { EditableCell } from '@/components/EditableCell'
import { CreateEdgeDialog } from '@/components/CreateEdgeDialog'
import { DeleteEdgeDialog } from '@/components/DeleteEdgeDialog'
import { ImportDialog } from '@/components/ImportDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, MoreVertical, Plus, Trash2, Upload } from 'lucide-react'
import type { Edge, EdgeTypeField } from '@lattice/shared'

export const Route = createFileRoute('/graphs/$graphId/edges/$edgeTypeSlug')({
  component: EdgeTypeTablePage,
})

function EdgeTypeTablePage() {
  const { graphId, edgeTypeSlug } = Route.useParams()

  const queryClient = useQueryClient()

  // --- Pagination, sorting, filtering state ---
  const [offset, setOffset] = useState(0)
  const [sorting, setSorting] = useState<SortingState>([])
  const [filterValue, setFilterValue] = useState('')

  // --- Import dialog state ---
  const [importOpen, setImportOpen] = useState(false)

  // --- Delete dialog state ---
  const [deleteTarget, setDeleteTarget] = useState<{
    edgeId: string
    label: string
  } | null>(null)

  const handleSortingChange = useCallback(
    (updater: SortingState | ((old: SortingState) => SortingState)) => {
      setSorting(updater)
      setOffset(0)
    },
    [],
  )

  const handleFilterChange = useCallback((value: string) => {
    setFilterValue(value)
    setOffset(0)
  }, [])

  // --- Resolve edgeTypeSlug to edge type ---
  const { data: edgeTypes, isLoading: edgeTypesLoading } = useQuery({
    queryKey: edgeTypeKeys.list(graphId),
    queryFn: () => api.listEdgeTypes(graphId),
  })

  const edgeType = useMemo(
    () => edgeTypes?.find((et) => et.slug === edgeTypeSlug),
    [edgeTypes, edgeTypeSlug],
  )

  // --- Fetch field definitions for the edge type ---
  const { data: fields } = useQuery({
    queryKey: edgeTypeFieldKeys.list(graphId, edgeType?.id ?? ''),
    queryFn: () => api.listEdgeTypeFields(graphId, edgeType!.id),
    enabled: !!edgeType,
  })

  // --- Fetch source and target node types (for display_field_slug) ---
  const { data: sourceNodeType } = useQuery({
    queryKey: nodeTypeKeys.detail(graphId, edgeType?.source_node_type_id ?? ''),
    queryFn: () => api.getNodeType(graphId, edgeType!.source_node_type_id),
    enabled: !!edgeType,
  })

  const { data: targetNodeType } = useQuery({
    queryKey: nodeTypeKeys.detail(graphId, edgeType?.target_node_type_id ?? ''),
    queryFn: () => api.getNodeType(graphId, edgeType!.target_node_type_id),
    enabled: !!edgeType,
  })

  // --- Update edge mutation ---
  const updateEdge = useUpdateEdge(graphId)

  // --- Build ListOptions ---
  const sortParam = useMemo(() => {
    if (sorting.length === 0) return undefined
    const col = sorting[0]
    return `${col.id}:${col.desc ? 'desc' : 'asc'}`
  }, [sorting])

  const filterOpts = useMemo(() => {
    if (!filterValue.trim()) return undefined
    const textFields = fields?.filter((f) => f.field_type === 'text') ?? []
    if (textFields.length === 0) return undefined
    const firstTextField = textFields[0]
    return { [firstTextField.slug]: { contains: filterValue.trim() } }
  }, [filterValue, fields])

  const listOpts = useMemo(
    () => ({ limit: 50, offset, sort: sortParam, filters: filterOpts }),
    [offset, sortParam, filterOpts],
  )

  const {
    data: edges,
    pagination,
    isLoading: edgesLoading,
  } = useEdges(graphId, edgeType?.id ?? '', listOpts)

  // --- Collect unique node IDs from current page of edges ---
  const { sourceNodeIds, targetNodeIds } = useMemo(() => {
    if (!edges) return { sourceNodeIds: [] as string[], targetNodeIds: [] as string[] }
    const sourceSet = new Set<string>()
    const targetSet = new Set<string>()
    for (const edge of edges) {
      sourceSet.add(edge.source_node_id)
      targetSet.add(edge.target_node_id)
    }
    return { sourceNodeIds: Array.from(sourceSet), targetNodeIds: Array.from(targetSet) }
  }, [edges])

  const allNodeIds = useMemo(() => {
    const combined = new Set([...sourceNodeIds, ...targetNodeIds])
    return Array.from(combined)
  }, [sourceNodeIds, targetNodeIds])

  // --- Batch-fetch all referenced nodes in a single request ---
  const { nodeMap } = useBatchNodes(graphId, allNodeIds)

  // --- Build nodeId -> display label map ---
  const nodeDisplayLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const nodeId of allNodeIds) {
      const node = nodeMap.get(nodeId)
      if (node) {
        let displaySlug: string | null = null
        if (sourceNodeIds.includes(nodeId) && sourceNodeType?.display_field_slug) {
          displaySlug = sourceNodeType.display_field_slug
        } else if (targetNodeIds.includes(nodeId) && targetNodeType?.display_field_slug) {
          displaySlug = targetNodeType.display_field_slug
        }
        if (!displaySlug && sourceNodeType?.display_field_slug && node.node_type_id === sourceNodeType?.id) {
          displaySlug = sourceNodeType.display_field_slug
        }
        if (!displaySlug && targetNodeType?.display_field_slug && node.node_type_id === targetNodeType?.id) {
          displaySlug = targetNodeType.display_field_slug
        }
        if (displaySlug && node.data[displaySlug] != null) {
          map.set(nodeId, String(node.data[displaySlug]))
        } else {
          map.set(nodeId, nodeId)
        }
      } else {
        map.set(nodeId, nodeId)
      }
    }
    return map
  }, [allNodeIds, nodeMap, sourceNodeType, targetNodeType, sourceNodeIds, targetNodeIds])

  // --- Inline edit handler ---
  const handleFieldSave = useCallback(
    (edge: Edge, fieldSlug: string, newValue: unknown) => {
      if (!edgeType) return
      updateEdge.mutate({
        edgeId: edge.id,
        edgeTypeId: edgeType.id,
        input: { data: { [fieldSlug]: newValue } },
      })
    },
    [edgeType, updateEdge],
  )

  // --- Edge display label for delete dialog ---
  const getEdgeDisplayLabel = useCallback(
    (edge: Edge) => {
      const sourceLabel = nodeDisplayLabels.get(edge.source_node_id) ?? edge.source_node_id
      const targetLabel = nodeDisplayLabels.get(edge.target_node_id) ?? edge.target_node_id
      return `${sourceLabel} → ${targetLabel}`
    },
    [nodeDisplayLabels],
  )

  // --- Build columns ---
  const columns = useMemo<ColumnDef<Edge, unknown>[]>(() => {
    const cols: ColumnDef<Edge, unknown>[] = [
      {
        id: 'source',
        header: sourceNodeType?.name ? `Source (${sourceNodeType.name})` : 'Source',
        cell: ({ row }) => {
          const label = nodeDisplayLabels.get(row.original.source_node_id)
          return <span className="truncate">{label ?? row.original.source_node_id}</span>
        },
        enableSorting: false,
      },
      {
        id: 'target',
        header: targetNodeType?.name ? `Target (${targetNodeType.name})` : 'Target',
        cell: ({ row }) => {
          const label = nodeDisplayLabels.get(row.original.target_node_id)
          return <span className="truncate">{label ?? row.original.target_node_id}</span>
        },
        enableSorting: false,
      },
    ]

    // Add columns for each edge field definition with inline editing
    if (fields) {
      const sortedFields = [...fields].sort((a, b) => a.ordinal - b.ordinal)
      for (const field of sortedFields) {
        cols.push({
          id: field.slug,
          header: field.name,
          cell: ({ row }) => (
            <EditableCell
              field={field as EdgeTypeField}
              value={row.original.data[field.slug]}
              onSave={(newValue) => handleFieldSave(row.original, field.slug, newValue)}
            />
          ),
          enableSorting: true,
        })
      }
    }

    // Actions column
    cols.push({
      id: '_actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                <MoreVertical className="h-4 w-4" />
              </button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() =>
                setDeleteTarget({
                  edgeId: row.original.id,
                  label: getEdgeDisplayLabel(row.original),
                })
              }
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    })

    return cols
  }, [fields, sourceNodeType, targetNodeType, nodeDisplayLabels, handleFieldSave, getEdgeDisplayLabel])

  // --- Error states ---
  if (!edgeTypesLoading && edgeTypes && !edgeType) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <h2 className="text-lg font-semibold text-destructive">Edge type not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            No edge type with slug &ldquo;{edgeTypeSlug}&rdquo; exists in this graph.
          </p>
        </div>
      </div>
    )
  }

  // --- Loading state ---
  if (edgeTypesLoading || !edgeType) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-64 animate-pulse rounded-lg border bg-muted/30" />
      </div>
    )
  }

  const handleExport = async () => {
    try {
      const blob = await api.exportEdges(graphId, edgeType.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${edgeType.name}_edges.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export edges:', error)
      window.alert('Failed to export edges. Please try again.')
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold">{edgeType.name}</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            Import CSV
          </Button>
          <CreateEdgeDialog graphId={graphId} edgeType={edgeType}>
            <Button size="sm">
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Edge
            </Button>
          </CreateEdgeDialog>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={edges ?? []}
        pagination={pagination}
        onPaginationChange={setOffset}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        filterValue={filterValue}
        onFilterChange={handleFilterChange}
        isLoading={edgesLoading}
        emptyMessage={`No ${edgeType.name} edges yet.`}
      />

      {/* Delete edge confirmation */}
      {deleteTarget && (
        <DeleteEdgeDialog
          graphId={graphId}
          edgeId={deleteTarget.edgeId}
          edgeTypeId={edgeType.id}
          displayLabel={deleteTarget.label}
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
        />
      )}

      {/* Import dialog */}
      <ImportDialog
        graphId={graphId}
        entityType="edges"
        typeId={edgeType.id}
        typeName={edgeType.name}
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: edgeKeys.list(graphId, edgeType.id) })
        }}
      />
    </div>
  )
}
