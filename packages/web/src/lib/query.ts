import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export const graphKeys = {
  all: ['graphs'] as const,
  list: () => [...graphKeys.all, 'list'] as const,
  detail: (id: string) => [...graphKeys.all, id] as const,
}

export const tokenKeys = {
  all: ['tokens'] as const,
  list: () => [...tokenKeys.all, 'list'] as const,
}

export const nodeTypeKeys = {
  all: ['nodeTypes'] as const,
  list: (graphId: string) => [...nodeTypeKeys.all, 'list', graphId] as const,
  detail: (graphId: string, nodeTypeId: string) =>
    [...nodeTypeKeys.all, graphId, nodeTypeId] as const,
}

export const nodeTypeFieldKeys = {
  all: ['nodeTypeFields'] as const,
  list: (graphId: string, nodeTypeId: string) =>
    [...nodeTypeFieldKeys.all, 'list', graphId, nodeTypeId] as const,
}

export const edgeTypeKeys = {
  all: ['edgeTypes'] as const,
  list: (graphId: string) => [...edgeTypeKeys.all, 'list', graphId] as const,
  detail: (graphId: string, edgeTypeId: string) =>
    [...edgeTypeKeys.all, graphId, edgeTypeId] as const,
}

export const edgeTypeFieldKeys = {
  all: ['edgeTypeFields'] as const,
  list: (graphId: string, edgeTypeId: string) =>
    [...edgeTypeFieldKeys.all, 'list', graphId, edgeTypeId] as const,
}

export const nodeKeys = {
  all: ['nodes'] as const,
  list: (graphId: string, nodeTypeId: string) =>
    [...nodeKeys.all, 'list', graphId, nodeTypeId] as const,
  detail: (graphId: string, nodeId: string) =>
    [...nodeKeys.all, graphId, nodeId] as const,
}

export const edgeKeys = {
  all: ['edges'] as const,
  list: (graphId: string, edgeTypeId: string) =>
    [...edgeKeys.all, 'list', graphId, edgeTypeId] as const,
  detail: (graphId: string, edgeId: string) =>
    [...edgeKeys.all, graphId, edgeId] as const,
}
