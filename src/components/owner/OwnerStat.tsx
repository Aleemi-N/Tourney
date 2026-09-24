export function OwnerStat({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'accent' }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/40">{label}</p>
            <p className={`mt-2 text-xl font-black ${tone === 'accent' ? 'text-fuchsia-200' : 'text-white'}`}>{value}</p>
        </div>
    );
}