import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { Link } from '@tanstack/react-router'

export const Route = createFileRoute('/auth/callback')({
  component: CallbackPage,
})

function CallbackPage() {
  const navigate = useNavigate()
  const { refetchSession } = useAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function verify() {
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')

      if (!token) {
        setError('No token found in URL')
        return
      }

      try {
        const res = await fetch(
          `/api/auth/magic-link/verify?token=${encodeURIComponent(token)}`,
          { credentials: 'include' },
        )

        if (!res.ok) {
          const body = await res.json().catch(() => null)
          throw new Error(body?.message ?? 'Verification failed')
        }

        await refetchSession()
        navigate({ to: '/' })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Verification failed')
      }
    }

    verify()
  }, [navigate, refetchSession])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <p className="text-destructive">{error}</p>
          <Link to="/auth/signin" className="text-sm underline">
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">Signing you in...</p>
    </div>
  )
}
