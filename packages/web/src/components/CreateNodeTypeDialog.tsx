import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { nodeTypeKeys, viewDataKeys } from '@/lib/query'
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

const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#14b8a6', '#06b6d4', '#3b82f6', '#6366f1', '#a855f7',
  '#ec4899', '#78716c',
]

const ICON_OPTIONS = [
  'circle', 'square', 'triangle', 'star', 'heart',
  'user', 'file', 'folder', 'tag', 'flag',
  'bookmark', 'zap',
]

export function CreateNodeTypeDialog({
  graphId,
  children,
}: {
  graphId: string
  children: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLOR_PALETTE[0])
  const [icon, setIcon] = useState(ICON_OPTIONS[0])
  const queryClient = useQueryClient()

  const createNodeType = useMutation({
    mutationFn: () => api.createNodeType(graphId, { name, color, icon }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: nodeTypeKeys.list(graphId) })
      queryClient.invalidateQueries({ queryKey: viewDataKeys.all })
      setOpen(false)
      setName('')
      setColor(COLOR_PALETTE[0])
      setIcon(ICON_OPTIONS[0])
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Node Type</DialogTitle>
          <DialogDescription>
            Define a new type of node for your graph.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            createNodeType.mutate()
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <label htmlFor="nt-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="nt-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Person, Company, Document"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-md border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: color === c ? 'var(--color-foreground)' : 'transparent',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Icon</label>
            <div className="flex flex-wrap gap-1.5">
              {ICON_OPTIONS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setIcon(i)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    icon === i
                      ? 'border-foreground bg-foreground/10 font-medium'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </div>
          {createNodeType.isError && (
            <p className="text-sm text-destructive">
              {createNodeType.error instanceof Error
                ? createNodeType.error.message
                : 'Failed to create node type'}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={createNodeType.isPending}>
              {createNodeType.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
