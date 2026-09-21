export default function DashboardLoading() {
  return (
    <main className="p-4 md:p-8 max-w-5xl mx-auto" aria-label="Loading dashboard">
      <div className="mb-8 space-y-3 animate-pulse">
        <div className="h-9 w-48 rounded-lg bg-surface-muted" />
        <div className="h-4 w-72 max-w-full rounded bg-surface-muted" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 animate-pulse">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-48 rounded-xl border border-border bg-surface" />
        ))}
      </div>
    </main>
  );
}
