import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { nodeTypeKeys, nodeTypeFieldKeys, nodeKeys, viewDataKeys } from '@/lib/query'
import { useNodes, useUpdateNode } from '@/hooks/use-nodes'
import { DataTable } from '@/components/DataTable'
import { EditableCell } from '@/components/EditableCell'
import { CreateNodeDialog } from '@/components/CreateNodeDialog'
import { DeleteNodeDialog } from '@/components/DeleteNodeDialog'
import { ImportDialog } from '@/components/ImportDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Download, MoreVertical, Plus, Trash2, Upload } from 'lucide-react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import type { Node, NodeTypeField, FieldType } from '@lattice/shared'

export const Route = createFileRoute('/graphs/$graphId/nodes/$nodeTypeSlug')({
  component: NodeTablePage,
})

const DEFAULT_LIMIT = 50

function NodeTablePage() {
  const { graphId, nodeTypeSlug } = Route.useParams()

  // --- Resolve slug to node type ---
  const {
    data: nodeTypes,
    isLoading: nodeTypesLoading,
    error: nodeTypesError,
  } = useQuery({
    queryKey: nodeTypeKeys.list(graphId),
    queryFn: () => api.listNodeTypes(graphId),
  })

  const nodeType = useMemo(
    () => nodeTypes?.find((nt) => nt.slug === nodeTypeSlug),
    [nodeTypes, nodeTypeSlug],
  )

  // --- Fetch field definitions ---
  const { data: fields, isLoading: fieldsLoading } = useQuery({
    queryKey: nodeTypeFieldKeys.list(graphId, nodeType?.id ?? ''),
    queryFn: () => api.listNodeTypeFields(graphId, nodeType!.id),
    enabled: !!nodeType,
  })

  // --- Pagination state ---
  const [offset, setOffset] = useState(0)
  const [limit] = useState(DEFAULT_LIMIT)

  // --- Sorting state ---
  const [sorting, setSorting] = useState<SortingState>([])

  const sortParam = useMemo(() => {
    if (sorting.length === 0) return undefined
    const { id, desc } = sorting[0]
    return `${id}:${desc ? 'desc' : 'asc'}`
  }, [sorting])

  // --- Filter state ---
  const [filterValue, setFilterValue] = useState('')

  const filterParams = useMemo(() => {
    if (!filterValue.trim() || !fields) return undefined
    const textFields = fields.filter(
      (f) => f.field_type === 'text' || f.field_type === 'url' || f.field_type === 'email',
    )
    if (textFields.length === 0) return undefined
    const firstTextField = textFields[0]
    return { [firstTextField.slug]: { contains: filterValue.trim() } }
  }, [filterValue, fields])

  // --- Fetch nodes ---
  const listOpts = useMemo(
    () => ({ limit, offset, sort: sortParam, filters: filterParams }),
    [limit, offset, sortParam, filterParams],
  )

  const {
    data: nodes,
    pagination: nodesPagination,
    isLoading: nodesLoading,
  } = useNodes(graphId, nodeType?.id ?? '', listOpts)

  // --- Mutations ---
  const updateNode = useUpdateNode(graphId)
  const queryClient = useQueryClient()

  // --- Delete dialog state ---
  const [deleteTarget, setDeleteTarget] = useState<Node | null>(null)

  // --- Import dialog state ---
  const [importOpen, setImportOpen] = useState(false)

  // --- Export handler ---
  const handleExport = useCallback(async () => {
    if (!nodeType) return
    try {
      const blob = await api.exportNodes(graphId, nodeType.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${nodeType.name}_nodes.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export nodes:', error)
      window.alert('Failed to export nodes. Please try again.')
    }
  }, [graphId, nodeType])

  // --- Build columns from field definitions ---
  const sortedFields = useMemo(
    () => (fields ? [...fields].sort((a, b) => a.ordinal - b.ordinal) : []),
    [fields],
  )

  const columns = useMemo<ColumnDef<Node, unknown>[]>(() => {
    if (sortedFields.length === 0) return []

    const fieldCols: ColumnDef<Node, unknown>[] = sortedFields.map((field) => ({
      id: field.slug,
      header: field.name,
      enableSorting: true,
      accessorFn: (row: Node) => row.data[field.slug],
      cell: ({ row }) => (
        <EditableCell
          field={field}
          value={row.original.data[field.slug]}
          onSave={(newValue) => {
            updateNode.mutate({
              nodeId: row.original.id,
              nodeTypeId: row.original.node_type_id,
              input: { data: { [field.slug]: newValue } },
            })
          }}
        />
      ),
    }))

    // Actions column
    const actionsCol: ColumnDef<Node, unknown> = {
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
            <DropdownMenuItem onClick={() => setDeleteTarget(row.original)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    }

    return [...fieldCols, actionsCol]
  }, [sortedFields, updateNode])

  const handlePaginationChange = useCallback((newOffset: number) => {
    setOffset(newOffset)
  }, [])

  const handleFilterChange = useCallback((value: string) => {
    setFilterValue(value)
    setOffset(0)
  }, [])

  // --- Loading state ---
  if (nodeTypesLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  // --- Error state ---
  if (nodeTypesError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <p className="text-destructive">
          {nodeTypesError instanceof Error
            ? nodeTypesError.message
            : 'Failed to load node types'}
        </p>
        <Link to="/graphs/$graphId/settings" params={{ graphId }} className="text-sm underline">
          Go to Settings
        </Link>
      </div>
    )
  }

  // --- Slug not found ---
  if (!nodeType) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <p className="text-destructive">
          Node type &ldquo;{nodeTypeSlug}&rdquo; not found.
        </p>
        <Link to="/graphs/$graphId/settings" params={{ graphId }} className="text-sm underline">
          Go to Settings
        </Link>
      </div>
    )
  }

  const isLoading = fieldsLoading || nodesLoading

  return (
    <div className="flex flex-1 flex-col p-6">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="h-5 w-5 rounded-sm"
            style={{ backgroundColor: nodeType.color ?? '#78716c' }}
          />
          <h1 className="text-xl font-semibold">{nodeType.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1 h-3.5 w-3.5" />
            Import CSV
          </Button>
          {fields && (
            <CreateNodeDialog graphId={graphId} nodeType={nodeType} fields={fields}>
              <Button size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Node
              </Button>
            </CreateNodeDialog>
          )}
        </div>
      </div>

      {/* Data table */}
      <DataTable
        columns={columns}
        data={nodes ?? []}
        pagination={nodesPagination}
        onPaginationChange={handlePaginationChange}
        sorting={sorting}
        onSortingChange={setSorting}
        filterValue={filterValue}
        onFilterChange={handleFilterChange}
        isLoading={isLoading}
        emptyMessage={`No ${nodeType.name} nodes yet.`}
      />

      {/* Delete dialog */}
      {deleteTarget && (
        <DeleteNodeDialog
          graphId={graphId}
          node={deleteTarget}
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
        />
      )}

      {/* Import dialog */}
      <ImportDialog
        graphId={graphId}
        entityType="nodes"
        typeId={nodeType.id}
        typeName={nodeType.name}
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: nodeKeys.list(graphId, nodeType.id) })
          queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
        }}
      />
    </div>
  )
}
