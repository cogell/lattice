import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { viewDataKeys } from '@/lib/query'

export function useViewData(graphId: string) {
  const query = useQuery({
    queryKey: viewDataKeys.detail(graphId),
    queryFn: () => api.getViewData(graphId),
    staleTime: 30_000,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  }
}
