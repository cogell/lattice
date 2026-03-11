import { useState, useRef } from 'react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Upload } from 'lucide-react'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

interface ImportDialogProps {
  graphId: string
  entityType: 'nodes' | 'edges'
  typeId: string
  typeName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function ImportDialog({
  graphId,
  entityType,
  typeId,
  typeName,
  open,
  onOpenChange,
  onSuccess,
}: ImportDialogProps) {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCount, setSuccessCount] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function reset() {
    setFile(null)
    setUploading(false)
    setError(null)
    setSuccessCount(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      reset()
    }
    onOpenChange(nextOpen)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    setSuccessCount(null)
    const selected = e.target.files?.[0] ?? null
    if (selected && selected.size > MAX_FILE_SIZE) {
      setError(`File exceeds the 5 MB limit (${(selected.size / 1024 / 1024).toFixed(1)} MB).`)
      setFile(null)
      return
    }
    setFile(selected)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setError(null)
    setSuccessCount(null)

    try {
      const result =
        entityType === 'nodes'
          ? await api.importNodes(graphId, typeId, file)
          : await api.importEdges(graphId, typeId, file)

      setSuccessCount(result.imported)
      onSuccess()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Import failed. Please check your CSV file.'
      setError(message)
    } finally {
      setUploading(false)
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import {typeName} {entityType}</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import {entityType}. The file must match the expected schema.
            Maximum file size: 5 MB, 5000 rows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File input */}
          <div className="space-y-2">
            <label
              htmlFor="csv-file"
              className="text-sm font-medium"
            >
              CSV File
            </label>
            <input
              ref={fileInputRef}
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              disabled={uploading}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-muted/80"
            />
          </div>

          {/* File preview */}
          {file && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <p className="font-medium">{file.name}</p>
              <p className="text-muted-foreground">{formatFileSize(file.size)}</p>
            </div>
          )}

          {/* Success message */}
          {successCount !== null && (
            <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-200">
              Successfully imported {successCount} {entityType}.
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          {successCount !== null ? (
            <Button onClick={() => handleOpenChange(false)}>
              Done
            </Button>
          ) : (
            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
            >
              {uploading ? (
                'Uploading...'
              ) : (
                <>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Upload
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
