export function OwnerStat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'accent' }) {
    return (
        <div className="rounded-2xl border border-border bg-surface-muted p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-muted">{label}</p>
            <p className={`mt-2 text-xl font-black ${tone === 'accent' ? 'text-primary' : 'text-text-primary'}`}>{value}</p>
        </div>
    );
}