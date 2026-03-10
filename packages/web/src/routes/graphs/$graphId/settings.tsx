import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { graphKeys } from '@/lib/query'

export const Route = createFileRoute('/graphs/$graphId/settings')({
  component: GraphSettingsPage,
})

function GraphSettingsPage() {
  const { graphId } = Route.useParams()

  const { data: graph } = useQuery({
    queryKey: graphKeys.detail(graphId),
    queryFn: () => api.getGraph(graphId),
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
        <h2 className="text-lg font-semibold">Schema</h2>
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Schema editor coming in Phase 9
          </p>
        </div>
      </section>
    </div>
  )
}
