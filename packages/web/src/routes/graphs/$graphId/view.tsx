import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ReactFlowProvider } from '@xyflow/react'
import { useViewData } from '@/hooks/use-view-data'
import { GraphCanvas } from '@/components/GraphCanvas'
import { AlertTriangle, Loader2 } from 'lucide-react'

export const Route = createFileRoute('/graphs/$graphId/view')({
  component: GraphViewPage,
})

function GraphViewPage() {
  const { graphId } = Route.useParams()
  const { data, isLoading, error } = useViewData(graphId)

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
        <p className="text-destructive">
          {error instanceof Error ? error.message : 'Failed to load graph data'}
        </p>
      </div>
    )
  }

  // No schema defined yet — direct to Settings
  if (!data || data.node_types.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold">Graph View</h2>
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <p className="text-muted-foreground">No node types yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Go to{' '}
            <Link
              to="/graphs/$graphId/settings"
              params={{ graphId }}
              className="underline hover:text-foreground"
            >
              Settings
            </Link>{' '}
            to define your schema.
          </p>
        </div>
      </div>
    )
  }

  // Schema exists but no nodes
  if (data.nodes.length === 0) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold">Graph View</h2>
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <p className="text-muted-foreground">No nodes yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Add data in the table views to see the graph.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {data.truncated && <TruncationBanner counts={data.counts} />}
      <div className="flex-1">
        <ReactFlowProvider>
          <GraphCanvas viewData={data} />
        </ReactFlowProvider>
      </div>
    </div>
  )
}

function TruncationBanner({
  counts,
}: {
  counts: { nodes: number; edges: number; node_limit: number; edge_limit: number }
}) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  const parts: string[] = []
  if (counts.nodes > counts.node_limit) {
    parts.push(`${counts.node_limit.toLocaleString()} of ${counts.nodes.toLocaleString()}+ nodes`)
  }
  if (counts.edges > counts.edge_limit) {
    parts.push(`${counts.edge_limit.toLocaleString()} of ${counts.edges.toLocaleString()}+ edges`)
  }

  return (
    <div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>Showing {parts.join(' and ')}. Large graphs may not display all data.</span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-auto text-xs underline hover:no-underline"
      >
        Dismiss
      </button>
    </div>
  )
}
