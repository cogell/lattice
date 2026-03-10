import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Settings } from 'lucide-react'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <Link to="/" className="text-lg font-semibold">
          Lattice
        </Link>
        <Link
          to="/settings"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <Settings className="h-5 w-5" />
        </Link>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-56 shrink-0 border-r md:block">
          {/* Sidebar slot — graph navigation will go here */}
        </aside>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  )
}
