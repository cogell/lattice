import { createFileRoute, Outlet, Link, useMatch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { requireAuth } from '@/lib/auth-guard'
import { api } from '@/lib/api'
import { graphKeys, nodeTypeKeys, edgeTypeKeys } from '@/lib/query'
import { Eye, Settings, icons } from 'lucide-react'
import type { NodeType, EdgeType } from '@lattice/shared'

export const Route = createFileRoute('/graphs/$graphId')({
  beforeLoad: () => requireAuth(),
  component: GraphLayout,
})

/** Convert a kebab-case icon name (e.g. "arrow-right") to PascalCase ("ArrowRight") for lucide lookup. */
function kebabToPascal(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/** Resolve a lucide icon component from its kebab-case name stored on a NodeType. */
function resolveLucideIcon(iconName: string | null): React.ComponentType<{ className?: string }> | null {
  if (!iconName) return null
  const pascalName = kebabToPascal(iconName)
  const IconComponent = (icons as Record<string, React.ComponentType<{ className?: string }>>)[pascalName]
  return IconComponent ?? null
}

function GraphLayout() {
  const { graphId } = Route.useParams()

  const { data: graph, isLoading, error } = useQuery({
    queryKey: graphKeys.detail(graphId),
    queryFn: () => api.getGraph(graphId),
  })

  const { data: nodeTypes, isLoading: nodeTypesLoading } = useQuery({
    queryKey: nodeTypeKeys.list(graphId),
    queryFn: () => api.listNodeTypes(graphId),
    enabled: !isLoading && !error,
  })

  const { data: edgeTypes, isLoading: edgeTypesLoading } = useQuery({
    queryKey: edgeTypeKeys.list(graphId),
    queryFn: () => api.listEdgeTypes(graphId),
    enabled: !isLoading && !error,
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
        <nav className="flex w-44 shrink-0 flex-col gap-1 overflow-y-auto border-r p-2">
          <NavLink to="/graphs/$graphId/view" params={{ graphId }} label="View" icon={Eye} />
          <NavLink to="/graphs/$graphId/settings" params={{ graphId }} label="Settings" icon={Settings} />

          <SidebarSeparator />

          <SidebarSection label="Node Types">
            {nodeTypesLoading && <SidebarSkeleton count={2} />}
            {!nodeTypesLoading && (!nodeTypes || nodeTypes.length === 0) && (
              <SidebarEmptyHint graphId={graphId} message="No node types" />
            )}
            {!nodeTypesLoading &&
              nodeTypes &&
              nodeTypes.length > 0 &&
              nodeTypes.map((nt) => (
                <NodeTypeNavLink key={nt.id} graphId={graphId} nodeType={nt} />
              ))}
          </SidebarSection>

          <SidebarSeparator />

          <SidebarSection label="Edge Types">
            {edgeTypesLoading && <SidebarSkeleton count={2} />}
            {!edgeTypesLoading && (!edgeTypes || edgeTypes.length === 0) && (
              <SidebarEmptyHint graphId={graphId} message="No edge types" />
            )}
            {!edgeTypesLoading &&
              edgeTypes &&
              edgeTypes.length > 0 &&
              edgeTypes.map((et) => (
                <EdgeTypeNavLink key={et.id} graphId={graphId} edgeType={et} />
              ))}
          </SidebarSection>
        </nav>
        <div className="flex flex-1 flex-col overflow-hidden">
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

function NodeTypeNavLink({
  graphId,
  nodeType,
}: {
  graphId: string
  nodeType: NodeType
}) {
  const match = useMatch({ from: '/graphs/$graphId/nodes/$nodeTypeSlug', shouldThrow: false })
  const isActive = !!match && match.params.nodeTypeSlug === nodeType.slug

  const ResolvedIcon = resolveLucideIcon(nodeType.icon)

  return (
    <Link
      to="/graphs/$graphId/nodes/$nodeTypeSlug"
      params={{ graphId, nodeTypeSlug: nodeType.slug }}
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        isActive
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      }`}
    >
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: nodeType.color ?? '#78716c' }}
      />
      {ResolvedIcon && <ResolvedIcon className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{nodeType.name}</span>
    </Link>
  )
}

function EdgeTypeNavLink({
  graphId,
  edgeType,
}: {
  graphId: string
  edgeType: EdgeType
}) {
  const match = useMatch({ from: '/graphs/$graphId/edges/$edgeTypeSlug', shouldThrow: false })
  const isActive = !!match && match.params.edgeTypeSlug === edgeType.slug

  return (
    <Link
      to="/graphs/$graphId/edges/$edgeTypeSlug"
      params={{ graphId, edgeTypeSlug: edgeType.slug }}
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        isActive
          ? 'bg-muted font-medium text-foreground'
          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      }`}
    >
      <span
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: edgeType.color ?? '#78716c' }}
      />
      <span className="truncate">{edgeType.name}</span>
    </Link>
  )
}

function SidebarSection({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

function SidebarSeparator() {
  return <div className="my-1 border-t" />
}

function SidebarSkeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="h-7 animate-pulse rounded-md bg-muted/30 px-2.5"
        />
      ))}
    </>
  )
}

function SidebarEmptyHint({
  graphId,
  message,
}: {
  graphId: string
  message: string
}) {
  return (
    <div className="px-2.5 py-1.5">
      <p className="text-xs text-muted-foreground">{message}</p>
      <Link
        to="/graphs/$graphId/settings"
        params={{ graphId }}
        className="text-xs underline hover:text-foreground"
      >
        Go to Settings
      </Link>
    </div>
  )
}
