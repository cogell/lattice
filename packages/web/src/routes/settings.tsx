import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '@/lib/auth-guard'
import { useAuth } from '@/lib/auth'
import { TokenList } from '@/components/TokenList'
import { CreateTokenDialog } from '@/components/CreateTokenDialog'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export const Route = createFileRoute('/settings')({
  beforeLoad: () => requireAuth(),
  component: SettingsPage,
})

function SettingsPage() {
  const { user, signOut } = useAuth()

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Account</h2>
        <div className="rounded-lg border p-4">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-muted-foreground">Email</dt>
              <dd className="mt-0.5">{user?.email ?? '...'}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">API Tokens</h2>
          <CreateTokenDialog>
            <Button size="sm">
              <Plus className="mr-1.5 h-4 w-4" />
              Create Token
            </Button>
          </CreateTokenDialog>
        </div>
        <TokenList />
      </section>
    </div>
  )
}
