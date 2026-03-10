import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { tokenKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Copy, Check } from 'lucide-react'

export function CreateTokenDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const queryClient = useQueryClient()

  const createToken = useMutation({
    mutationFn: () => api.createToken({ name }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tokenKeys.all })
      setCreatedToken(data.token)
    },
  })

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setName('')
      setCreatedToken(null)
      setCopied(false)
      createToken.reset()
    }
    setOpen(nextOpen)
  }

  async function handleCopy() {
    if (createdToken) {
      await navigator.clipboard.writeText(createdToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger render={<>{children}</>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create API Token</DialogTitle>
          <DialogDescription>
            Generate a personal access token for CLI and API access.
          </DialogDescription>
        </DialogHeader>

        {createdToken ? (
          <div className="space-y-3">
            <div className="rounded-md border bg-muted/50 p-3">
              <code className="block break-all text-sm">{createdToken}</code>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="mr-1.5 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-4 w-4" />
                  Copy token
                </>
              )}
            </Button>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Copy this token now. You won't be able to see it again.
            </p>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              createToken.mutate()
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <label htmlFor="token-name" className="text-sm font-medium">
                Token name
              </label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CLI access"
                required
                autoFocus
              />
            </div>
            {createToken.isError && (
              <p className="text-sm text-destructive">
                {createToken.error instanceof Error
                  ? createToken.error.message
                  : 'Failed to create token'}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={createToken.isPending}>
                {createToken.isPending ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
