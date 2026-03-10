import { redirect } from '@tanstack/react-router'

/**
 * Check if user is authenticated by calling the session endpoint.
 * Use in route beforeLoad hooks for protected routes.
 */
export async function requireAuth() {
  try {
    const res = await fetch('/api/auth/get-session', {
      credentials: 'include',
    })
    if (!res.ok) {
      throw redirect({ to: '/auth/signin' })
    }
    const data = await res.json()
    if (!data?.user) {
      throw redirect({ to: '/auth/signin' })
    }
    return data.user
  } catch (e) {
    if (e instanceof Response || (e && typeof e === 'object' && 'to' in e)) {
      throw e
    }
    throw redirect({ to: '/auth/signin' })
  }
}
