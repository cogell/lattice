import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { useRouter } from '@tanstack/react-router'

interface User {
  id: string
  email: string
  name: string | null
  image: string | null
}

interface AuthState {
  user: User | null
  isLoading: boolean
}

interface AuthContextValue extends AuthState {
  signOut: () => Promise<void>
  refetchSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true })

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/get-session', {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setState({ user: data?.user ?? null, isLoading: false })
      } else {
        setState({ user: null, isLoading: false })
      }
    } catch {
      setState({ user: null, isLoading: false })
    }
  }, [])

  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
    })
    setState({ user: null, isLoading: false })
    router.navigate({ to: '/auth/signin' })
  }, [router])

  return (
    <AuthContext.Provider
      value={{ ...state, signOut, refetchSession: fetchSession }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
