import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/lib/api'
import { nodeKeys, viewDataKeys } from '@/lib/query'
import type { ListOptions, CreateNodeInput, UpdateNodeInput, Node } from '@lattice/shared'

export function useNodes(
  graphId: string,
  nodeTypeId: string,
  opts?: ListOptions,
) {
  const query = useQuery({
    queryKey: [...nodeKeys.list(graphId, nodeTypeId), opts] as const,
    queryFn: () => api.listNodes(graphId, nodeTypeId, opts),
  })

  return {
    data: query.data?.data,
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    error: query.error,
  }
}

export function useCreateNode(graphId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateNodeInput) => api.createNode(graphId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: nodeKeys.list(graphId, variables.node_type_id),
      })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
    },
  })
}

export function useUpdateNode(graphId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: { nodeId: string; nodeTypeId: string; input: UpdateNodeInput }) =>
      api.updateNode(graphId, vars.nodeId, vars.input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: nodeKeys.list(graphId, variables.nodeTypeId),
      })
      queryClient.invalidateQueries({
        queryKey: nodeKeys.detail(graphId, variables.nodeId),
      })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
    },
  })
}

export function useDeleteNode(graphId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: { nodeId: string; nodeTypeId: string }) =>
      api.deleteNode(graphId, vars.nodeId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: nodeKeys.list(graphId, variables.nodeTypeId),
      })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
    },
  })
}

/** Fetch multiple nodes by ID in a single request. */
export function useBatchNodes(graphId: string, nodeIds: string[]) {
  const sortedIds = useMemo(() => nodeIds.slice().sort(), [nodeIds])
  const enabled = sortedIds.length > 0

  const query = useQuery({
    queryKey: nodeKeys.batch(graphId, sortedIds),
    queryFn: () => api.batchGetNodes(graphId, sortedIds),
    enabled,
    staleTime: 60_000,
  })

  const nodeMap = useMemo(() => {
    const map = new Map<string, Node>()
    if (query.data) {
      for (const node of query.data) {
        map.set(node.id, node)
      }
    }
    return map
  }, [query.data])

  return {
    data: query.data,
    nodeMap,
    isLoading: query.isLoading,
    error: query.error,
  }
}
