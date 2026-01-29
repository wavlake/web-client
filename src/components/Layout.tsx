import { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-surface-light bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎵</span>
            <span className="text-xl font-bold text-white">Wavlake</span>
          </div>
          <nav className="flex items-center gap-6">
            <a href="/" className="text-gray-400 hover:text-white transition-colors">
              Discover
            </a>
            <a href="/artists" className="text-gray-400 hover:text-white transition-colors">
              Artists
            </a>
            <a href="/albums" className="text-gray-400 hover:text-white transition-colors">
              Albums
            </a>
          </nav>
          <div>
            {/* Auth button placeholder */}
            <button className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors">
              Connect
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>

      {/* Player bar placeholder */}
      <div className="fixed bottom-0 left-0 right-0 h-20 border-t border-surface-light bg-surface">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded bg-surface-light" />
            <div>
              <p className="text-sm text-white">No track playing</p>
              <p className="text-xs text-gray-500">Select a track to start</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="text-gray-400 hover:text-white">⏮</button>
            <button className="rounded-full bg-white p-2 text-black hover:bg-gray-200">
              ▶
            </button>
            <button className="text-gray-400 hover:text-white">⏭</button>
          </div>
          <div className="w-48">
            {/* Volume/progress placeholder */}
          </div>
        </div>
      </div>
    </div>
  );
}
