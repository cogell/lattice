import { createApiClient } from '@lattice/shared'

export const api = createApiClient(
  '/api/v1',
  () => '',
  { credentials: 'include' },
)
