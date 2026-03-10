import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { graphKeys } from '@/lib/query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export function CreateGraphDialog({ children }: { children: React.ReactElement }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const queryClient = useQueryClient()

  const createGraph = useMutation({
    mutationFn: () => api.createGraph({ name, description: description || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: graphKeys.all })
      setOpen(false)
      setName('')
      setDescription('')
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Graph</DialogTitle>
          <DialogDescription>
            A graph is a workspace for your node types, edge types, and data.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createGraph.mutate()
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="graph-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="graph-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Graph"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="graph-desc" className="text-sm font-medium">
              Description
            </label>
            <Textarea
              id="graph-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              rows={3}
            />
          </div>
          {createGraph.isError && (
            <p className="text-sm text-destructive">
              {createGraph.error instanceof Error
                ? createGraph.error.message
                : 'Failed to create graph'}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={createGraph.isPending}>
              {createGraph.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
