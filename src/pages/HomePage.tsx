export default function HomePage() {
  return (
    <div className="space-y-8 pb-24">
      <section>
        <h1 className="mb-6 text-3xl font-bold text-white">Discover Music</h1>
        <p className="text-gray-400 mb-8">
          Browse music from independent artists on the Nostr network.
        </p>
        
        {/* Placeholder grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="group cursor-pointer rounded-lg bg-surface p-4 transition-colors hover:bg-surface-light"
            >
              <div className="aspect-square w-full rounded-md bg-surface-light mb-3" />
              <p className="text-sm font-medium text-white truncate">
                Track {i + 1}
              </p>
              <p className="text-xs text-gray-500 truncate">Artist Name</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold text-white">Recent Albums</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="group cursor-pointer rounded-lg bg-surface p-4 transition-colors hover:bg-surface-light"
            >
              <div className="aspect-square w-full rounded-md bg-surface-light mb-3" />
              <p className="text-sm font-medium text-white truncate">
                Album {i + 1}
              </p>
              <p className="text-xs text-gray-500 truncate">Artist Name</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
