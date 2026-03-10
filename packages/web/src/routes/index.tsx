import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { requireAuth } from '@/lib/auth-guard'
import { api } from '@/lib/api'
import { graphKeys } from '@/lib/query'
import { CreateGraphDialog } from '@/components/CreateGraphDialog'
import { EditGraphDialog } from '@/components/EditGraphDialog'
import { DeleteGraphDialog } from '@/components/DeleteGraphDialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Graph } from '@lattice/shared'

export const Route = createFileRoute('/')({
  beforeLoad: () => requireAuth(),
  component: DashboardPage,
})

function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: graphKeys.list(),
    queryFn: () => api.listGraphs({ limit: 50 }),
  })

  const graphs = data?.data ?? []

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your Graphs</h1>
        <CreateGraphDialog>
          <Button>
            <Plus className="mr-1.5 h-4 w-4" />
            New Graph
          </Button>
        </CreateGraphDialog>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border bg-muted/30" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">
          Failed to load graphs: {error instanceof Error ? error.message : 'Unknown error'}
        </p>
      )}

      {!isLoading && !error && graphs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <p className="text-lg font-medium text-muted-foreground">No graphs yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Create your first graph to get started
          </p>
          <CreateGraphDialog>
            <Button className="mt-4">
              <Plus className="mr-1.5 h-4 w-4" />
              Create your first graph
            </Button>
          </CreateGraphDialog>
        </div>
      )}

      {!isLoading && graphs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {graphs.map((graph) => (
            <GraphCard key={graph.id} graph={graph} />
          ))}
        </div>
      )}
    </div>
  )
}

function GraphCard({ graph }: { graph: Graph }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  return (
    <>
      <div className="group relative rounded-lg border p-4 transition-colors hover:border-foreground/20 hover:bg-muted/30">
        <Link
          to="/graphs/$graphId/view"
          params={{ graphId: graph.id }}
          className="absolute inset-0 rounded-lg"
        />
        <div className="relative flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="font-medium">{graph.name}</h2>
            {graph.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {graph.description}
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Created {new Date(graph.created_at).toLocaleDateString()}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="relative z-10 opacity-0 transition-opacity group-hover:opacity-100"
                />
              }
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <EditGraphDialog graph={graph} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteGraphDialog graph={graph} open={deleteOpen} onOpenChange={setDeleteOpen} />
    </>
  )
}
