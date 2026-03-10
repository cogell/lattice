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
