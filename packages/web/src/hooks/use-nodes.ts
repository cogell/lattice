import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { nodeKeys } from '@/lib/query'
import type { ListOptions, CreateNodeInput, UpdateNodeInput } from '@lattice/shared'

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
    },
  })
}
