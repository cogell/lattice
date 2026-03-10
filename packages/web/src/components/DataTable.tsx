import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type OnChangeFn,
} from '@tanstack/react-table'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { PaginationMeta } from '@lattice/shared'

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  /** Pagination metadata from the server response. */
  pagination?: PaginationMeta
  /** Called when the user navigates pages. Receives the new offset. */
  onPaginationChange?: (offset: number) => void
  /** Current sorting state (TanStack format). */
  sorting?: SortingState
  /** Called when the user clicks a sortable column header. */
  onSortingChange?: OnChangeFn<SortingState>
  /** Current filter text. Provide to render the filter input. */
  filterValue?: string
  /** Called when the filter text changes. */
  onFilterChange?: (value: string) => void
  /** Whether the data is currently loading. */
  isLoading?: boolean
  /** Message shown when there are no rows. */
  emptyMessage?: string
}

export function DataTable<T>({
  columns,
  data,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  filterValue,
  onFilterChange,
  isLoading,
  emptyMessage = 'No data found.',
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    // Server-side sorting: controlled externally
    manualSorting: true,
    state: {
      sorting: sorting ?? [],
    },
    onSortingChange,
    // Server-side pagination: controlled externally
    manualPagination: true,
    rowCount: pagination?.total ?? data.length,
  })

  const showPagination = pagination && onPaginationChange
  const pageStart = pagination ? pagination.offset + 1 : 1
  const pageEnd = pagination
    ? Math.min(pagination.offset + pagination.limit, pagination.total)
    : data.length
  const hasPrev = pagination ? pagination.offset > 0 : false
  const hasNext = pagination ? pagination.has_more : false

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      {onFilterChange !== undefined && (
        <div className="flex items-center gap-2">
          <Input
            type="text"
            placeholder="Filter..."
            value={filterValue ?? ''}
            onChange={(e) => onFilterChange(e.target.value)}
            className="max-w-sm"
          />
        </div>
      )}

      {/* Table */}
      <div className="relative rounded-lg border">
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/60">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted/30">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const sorted = header.column.getIsSorted()

                  return (
                    <th
                      key={header.id}
                      className={`px-4 py-2 text-left font-medium${canSort ? ' cursor-pointer select-none' : ''}`}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="inline-flex flex-col text-muted-foreground">
                            <ChevronUp
                              className={`h-3 w-3 -mb-0.5${sorted === 'asc' ? ' text-foreground' : ''}`}
                            />
                            <ChevronDown
                              className={`h-3 w-3 -mt-0.5${sorted === 'desc' ? ' text-foreground' : ''}`}
                            />
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {!isLoading && table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {showPagination && pagination.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {pageStart}–{pageEnd} of {pagination.total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!hasPrev}
              onClick={() =>
                onPaginationChange(Math.max(0, pagination.offset - pagination.limit))
              }
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!hasNext}
              onClick={() => onPaginationChange(pagination.offset + pagination.limit)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
