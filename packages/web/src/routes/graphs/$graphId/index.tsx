import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/graphs/$graphId/')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/graphs/$graphId/view', params })
  },
})
