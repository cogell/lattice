import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { tokenKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Token } from '@lattice/shared'

export function TokenList() {
  const { data: tokens, isLoading } = useQuery({
    queryKey: tokenKeys.list(),
    queryFn: () => api.listTokens(),
  })

  if (isLoading) {
    return <div className="h-20 animate-pulse rounded-lg border bg-muted/30" />
  }

  if (!tokens || tokens.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No API tokens yet. Create one to get started.
      </p>
    )
  }

  return (
    <div className="rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="px-4 py-2 text-left font-medium">Name</th>
            <th className="px-4 py-2 text-left font-medium">Created</th>
            <th className="px-4 py-2 text-left font-medium">Last used</th>
            <th className="px-4 py-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <TokenRow key={token.id} token={token} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TokenRow({ token }: { token: Token }) {
  const [revokeOpen, setRevokeOpen] = useState(false)
  const queryClient = useQueryClient()

  const revokeToken = useMutation({
    mutationFn: () => api.deleteToken(token.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tokenKeys.all })
      setRevokeOpen(false)
    },
  })

  return (
    <>
      <tr className="border-b last:border-0">
        <td className="px-4 py-2 font-medium">{token.name}</td>
        <td className="px-4 py-2 text-muted-foreground">
          {new Date(token.created_at).toLocaleDateString()}
        </td>
        <td className="px-4 py-2 text-muted-foreground">
          {token.last_used_at
            ? new Date(token.last_used_at).toLocaleDateString()
            : 'Never'}
        </td>
        <td className="px-4 py-2 text-right">
          <Button variant="ghost" size="xs" onClick={() => setRevokeOpen(true)}>
            Revoke
          </Button>
        </td>
      </tr>

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke token "{token.name}"?</DialogTitle>
            <DialogDescription>
              This will permanently revoke this token. Any applications using it will lose
              access. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {revokeToken.isError && (
            <p className="text-sm text-destructive">
              {revokeToken.error instanceof Error
                ? revokeToken.error.message
                : 'Failed to revoke token'}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => revokeToken.mutate()}
              disabled={revokeToken.isPending}
            >
              {revokeToken.isPending ? 'Revoking...' : 'Revoke'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
