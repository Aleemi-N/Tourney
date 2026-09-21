export default function TournamentLoading() {
  return (
    <main
      className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto"
      aria-label="Loading tournament page"
    >
      <div className="animate-pulse space-y-6">
        <div className="h-4 w-36 rounded bg-surface-muted" />
        <section className="rounded-2xl border border-border bg-surface p-5 md:p-8">
          <div className="h-9 w-64 max-w-full rounded-lg bg-surface-muted" />
          <div className="mt-3 h-4 w-40 rounded bg-surface-muted" />
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="h-24 rounded-xl border border-border bg-surface-muted" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
