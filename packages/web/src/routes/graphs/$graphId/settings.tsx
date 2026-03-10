import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/lib/api'
import { graphKeys, nodeTypeKeys, edgeTypeKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { CreateNodeTypeDialog } from '@/components/CreateNodeTypeDialog'
import { EditNodeTypeDialog } from '@/components/EditNodeTypeDialog'
import { DeleteNodeTypeDialog } from '@/components/DeleteNodeTypeDialog'
import { NodeTypeFieldList } from '@/components/NodeTypeFieldList'
import { CreateEdgeTypeDialog } from '@/components/CreateEdgeTypeDialog'
import { EditEdgeTypeDialog } from '@/components/EditEdgeTypeDialog'
import { DeleteEdgeTypeDialog } from '@/components/DeleteEdgeTypeDialog'
import { EdgeTypeFieldList } from '@/components/EdgeTypeFieldList'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronDown, ChevronRight, MoreVertical, Pencil, Plus, Trash2 } from 'lucide-react'
import type { NodeType, EdgeType } from '@lattice/shared'

export const Route = createFileRoute('/graphs/$graphId/settings')({
  component: GraphSettingsPage,
})

function GraphSettingsPage() {
  const { graphId } = Route.useParams()

  const { data: graph } = useQuery({
    queryKey: graphKeys.detail(graphId),
    queryFn: () => api.getGraph(graphId),
  })

  const { data: nodeTypes, isLoading: nodeTypesLoading } = useQuery({
    queryKey: nodeTypeKeys.list(graphId),
    queryFn: () => api.listNodeTypes(graphId),
  })

  const { data: edgeTypes, isLoading: edgeTypesLoading } = useQuery({
    queryKey: edgeTypeKeys.list(graphId),
    queryFn: () => api.listEdgeTypes(graphId),
  })

  return (
    <div className="max-w-2xl space-y-8 p-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">General</h2>
        <div className="rounded-lg border p-4">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-muted-foreground">Name</dt>
              <dd className="mt-0.5">{graph?.name ?? '...'}</dd>
            </div>
            {graph?.description && (
              <div>
                <dt className="font-medium text-muted-foreground">Description</dt>
                <dd className="mt-0.5">{graph.description}</dd>
              </div>
            )}
            <div>
              <dt className="font-medium text-muted-foreground">Created</dt>
              <dd className="mt-0.5">
                {graph ? new Date(graph.created_at).toLocaleDateString() : '...'}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Node Types</h2>
          <CreateNodeTypeDialog graphId={graphId}>
            <Button size="sm">
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add node type
            </Button>
          </CreateNodeTypeDialog>
        </div>

        {nodeTypesLoading && (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted/30" />
            ))}
          </div>
        )}

        {!nodeTypesLoading && (!nodeTypes || nodeTypes.length === 0) && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No node types yet. Create one to define your schema.
            </p>
          </div>
        )}

        {!nodeTypesLoading && nodeTypes && nodeTypes.length > 0 && (
          <div className="space-y-2">
            {nodeTypes.map((nt) => (
              <NodeTypeCard key={nt.id} graphId={graphId} nodeType={nt} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Edge Types</h2>
          {nodeTypes && nodeTypes.length > 0 && (
            <CreateEdgeTypeDialog graphId={graphId}>
              <Button size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add edge type
              </Button>
            </CreateEdgeTypeDialog>
          )}
        </div>

        {edgeTypesLoading && (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted/30" />
            ))}
          </div>
        )}

        {!edgeTypesLoading && (!edgeTypes || edgeTypes.length === 0) && (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              {nodeTypes && nodeTypes.length > 0
                ? 'No edge types yet. Create one to connect your node types.'
                : 'Edge types will appear here once node types are defined.'}
            </p>
          </div>
        )}

        {!edgeTypesLoading && edgeTypes && edgeTypes.length > 0 && (
          <div className="space-y-2">
            {edgeTypes.map((et) => (
              <EdgeTypeCard
                key={et.id}
                graphId={graphId}
                edgeType={et}
                nodeTypes={nodeTypes ?? []}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function NodeTypeCard({ graphId, nodeType }: { graphId: string; nodeType: NodeType }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <div className="overflow-hidden rounded-lg border transition-colors hover:bg-muted/30">
        <div className="group flex items-center justify-between p-3">
          <button
            type="button"
            className="flex flex-1 items-center gap-3 text-left"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <div
              className="h-4 w-4 rounded-sm"
              style={{ backgroundColor: nodeType.color ?? '#78716c' }}
            />
            <div>
              <p className="text-sm font-medium">{nodeType.name}</p>
              <p className="text-xs text-muted-foreground">
                {nodeType.icon ?? 'circle'}
              </p>
            </div>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="opacity-0 transition-opacity group-hover:opacity-100"
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
        {expanded && (
          <NodeTypeFieldList graphId={graphId} nodeTypeId={nodeType.id} />
        )}
      </div>

      <EditNodeTypeDialog
        graphId={graphId}
        nodeType={nodeType}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteNodeTypeDialog
        graphId={graphId}
        nodeType={nodeType}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  )
}

function EdgeTypeCard({
  graphId,
  edgeType,
  nodeTypes,
}: {
  graphId: string
  edgeType: EdgeType
  nodeTypes: NodeType[]
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const sourceNodeType = nodeTypes.find(
    (nt) => nt.id === edgeType.source_node_type_id,
  )
  const targetNodeType = nodeTypes.find(
    (nt) => nt.id === edgeType.target_node_type_id,
  )

  return (
    <>
      <div className="overflow-hidden rounded-lg border transition-colors hover:bg-muted/30">
        <div className="group flex items-center justify-between p-3">
          <button
            type="button"
            className="flex flex-1 items-center gap-3 text-left"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{edgeType.name}</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {edgeType.directed ? 'directed' : 'undirected'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {sourceNodeType?.name ?? 'Unknown'} &rarr;{' '}
                {targetNodeType?.name ?? 'Unknown'}
              </p>
            </div>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="opacity-0 transition-opacity group-hover:opacity-100"
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
        {expanded && (
          <EdgeTypeFieldList graphId={graphId} edgeTypeId={edgeType.id} />
        )}
      </div>

      <EditEdgeTypeDialog
        graphId={graphId}
        edgeType={edgeType}
        nodeTypes={nodeTypes}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <DeleteEdgeTypeDialog
        graphId={graphId}
        edgeType={edgeType}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  )
}
