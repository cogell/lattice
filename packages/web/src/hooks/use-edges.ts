import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { edgeKeys, viewDataKeys } from '@/lib/query'
import type { ListOptions, CreateEdgeInput, UpdateEdgeInput } from '@lattice/shared'

export function useEdges(
  graphId: string,
  edgeTypeId: string,
  opts?: ListOptions,
) {
  const query = useQuery({
    queryKey: [...edgeKeys.list(graphId, edgeTypeId), opts] as const,
    queryFn: () => api.listEdges(graphId, edgeTypeId, opts),
  })

  return {
    data: query.data?.data,
    pagination: query.data?.pagination,
    isLoading: query.isLoading,
    error: query.error,
  }
}

export function useCreateEdge(graphId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: CreateEdgeInput) => api.createEdge(graphId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: edgeKeys.list(graphId, variables.edge_type_id),
      })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
    },
  })
}

export function useUpdateEdge(graphId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: { edgeId: string; edgeTypeId: string; input: UpdateEdgeInput }) =>
      api.updateEdge(graphId, vars.edgeId, vars.input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: edgeKeys.list(graphId, variables.edgeTypeId),
      })
      queryClient.invalidateQueries({
        queryKey: edgeKeys.detail(graphId, variables.edgeId),
      })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
    },
  })
}

export function useDeleteEdge(graphId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: { edgeId: string; edgeTypeId: string }) =>
      api.deleteEdge(graphId, vars.edgeId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: edgeKeys.list(graphId, variables.edgeTypeId),
      })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
    },
  })
}
