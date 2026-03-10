import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/graphs/$graphId/view')({
  component: GraphViewPage,
})

function GraphViewPage() {
  const { graphId } = Route.useParams()

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
