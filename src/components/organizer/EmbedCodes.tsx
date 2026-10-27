import { getCanonicalOrigin } from '@/lib/origin';

/** Paste-ready <iframe> code for the public widgets of a tournament. */
export function EmbedCodes({ slug }: { slug: string }) {
  const origin = getCanonicalOrigin();
  const widgets = [
    { label: 'League table', path: 'table', height: 420 },
    { label: 'Fixtures and results', path: 'fixtures', height: 520 },
  ];
  const code = (path: string, height: number) => `<iframe src="${origin}/embed/t/${slug}/${path}" width="100%" height="${height}" style="border:0;max-width:640px" loading="lazy" title="Tourny"></iframe>`;
  return (
    <details className="mt-4 rounded-xl border border-border bg-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold text-text-primary">Embed on your website</summary>
      <p className="mt-2 text-xs text-text-secondary">Paste one of these into your club website. It updates by itself and links back to Tourny. Add <code>?theme=dark</code> to the address for a dark version. A single match can be embedded with <code>/embed/t/{slug}/live/&lt;match id&gt;</code>.</p>
      <div className="mt-3 space-y-3">
        {widgets.map((w) => (
          <label key={w.path} className="block text-xs font-medium text-text-secondary">
            {w.label}
            <textarea readOnly rows={3} value={code(w.path, w.height)} className="mt-1 w-full rounded-lg border border-border bg-background p-2 font-mono text-[12px] text-text-primary" />
          </label>
        ))}
      </div>
    </details>
  );
}
