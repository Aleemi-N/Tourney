export default function TournamentLoading() {
  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto min-h-screen">
      <div className="animate-pulse flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="h-4 w-32 bg-surface-muted rounded" />
          <div className="h-8 w-64 bg-surface-muted rounded mt-2" />
          <div className="h-4 w-48 bg-surface-muted rounded" />
        </div>
        <div className="h-[400px] w-full bg-surface-muted rounded-xl border border-border" />
      </div>
    </div>
  );
}
