import { createFileRoute, Outlet, Link, useMatch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { requireAuth } from '@/lib/auth-guard'
import { api } from '@/lib/api'
import { graphKeys } from '@/lib/query'
import { Eye, Settings } from 'lucide-react'

export const Route = createFileRoute('/graphs/$graphId')({
  beforeLoad: () => requireAuth(),
  component: GraphLayout,
})

function GraphLayout() {
  const { graphId } = Route.useParams()

  const { data: graph, isLoading, error } = useQuery({
    queryKey: graphKeys.detail(graphId),
    queryFn: () => api.getGraph(graphId),
  })

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">Loading graph...</p>
      </div>
    )
  }

  if (error || !graph) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-destructive">
          {error instanceof Error ? error.message : 'Graph not found'}
        </p>
        <Link to="/" className="text-sm underline">
          Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2 text-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          Dashboard
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">{graph.name}</span>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <nav className="flex w-44 shrink-0 flex-col gap-1 border-r p-2">
          <NavLink to="/graphs/$graphId/view" params={{ graphId }} label="View" icon={Eye} />
          <NavLink to="/graphs/$graphId/settings" params={{ graphId }} label="Settings" icon={Settings} />
        </nav>
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

function NavLink({
  to,
  params,
  label,
  icon: Icon,
}: {
  to: '/graphs/$graphId/view' | '/graphs/$graphId/settings'
  params: { graphId: string }
  label: string
  icon: React.ComponentType<{ className?: string }>
}) {
  const match = useMatch({ from: to, shouldThrow: false })
  const isActive = !!match

  return (
    <Link
      to={to}
      params={params}
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        isActive
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}
