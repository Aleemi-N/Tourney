'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Palette, RefreshCw, X } from 'lucide-react';
import { buildPosterModel, fixturePageCount, POSTER_TEMPLATES, type PosterFixtureInput, type PosterTemplateId, type PosterTournament } from '@/lib/fixture-poster/model';
import { posterFileName, renderPoster } from '@/lib/fixture-poster/renderer';

export function FixturePosterDesigner({ tournament, fixtures }: { tournament: PosterTournament; fixtures: readonly PosterFixtureInput[] }) {
  const [open, setOpen] = useState(false);
  const [template, setTemplate] = useState<PosterTemplateId>('arena-dark');
  const [variant, setVariant] = useState(1);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [status, setStatus] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const model = useMemo(() => buildPosterModel(tournament, fixtures), [tournament, fixtures]);
  const pages = fixturePageCount(model.fixtures.length);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    let active = true; setStatus('Rendering preview…');
    void renderPoster(canvasRef.current, model, { template, variant, page })
      .then(() => { if (active) setStatus('Preview ready.'); })
      .catch(() => { if (active) setStatus('Preview could not be rendered.'); });
    return () => { active = false; };
  }, [open, model, page, revision, template, variant]);

  function download() {
    const canvas = canvasRef.current; if (!canvas) return;
    const link = document.createElement('a'); link.download = posterFileName(model, template, page); link.href = canvas.toDataURL('image/png', 1); link.click();
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary/40 px-4 text-sm font-bold text-primary"><Palette className="h-4 w-4"/>Preview Poster</button>
    {open&&<div className="fixed inset-0 z-100 flex items-end justify-center overflow-y-auto bg-black/80 p-2 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="fixture-poster-title">
      <div className="flex max-h-[calc(100svh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-2xl sm:max-h-[calc(100svh-2rem)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-xs font-black uppercase tracking-[.18em] text-primary">Fixture poster studio</p><h2 id="fixture-poster-title" className="mt-1 text-xl font-black">Preview and change design</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close poster designer" className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-border"><X className="h-5 w-5"/></button></div>
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-5 border-b border-border p-5 lg:border-r lg:border-b-0">
            <label className="block text-sm font-bold">Select template<select value={template} onChange={(event) => { setTemplate(event.target.value as PosterTemplateId); setPage(0); }} className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3">{POSTER_TEMPLATES.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <p className="text-sm leading-6 text-text-secondary">{POSTER_TEMPLATES.find((item)=>item.id===template)?.description}</p>
            <fieldset><legend className="text-sm font-bold">Controlled variant</legend><div className="mt-2 grid grid-cols-3 gap-2">{[1,2,3].map((item)=><button type="button" key={item} onClick={()=>setVariant(item)} className={`min-h-11 rounded-lg border font-bold ${variant===item?'border-primary bg-primary/15 text-primary':'border-border'}`}>{item}</button>)}</div></fieldset>
            <button type="button" onClick={()=>setRevision((value)=>value+1)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border font-bold"><RefreshCw className="h-4 w-4"/>Regenerate preview</button>
            {pages>1&&<div><p className="text-sm font-bold">Poster page</p><div className="mt-2 flex gap-2">{Array.from({length:pages},(_,index)=><button type="button" key={index} onClick={()=>setPage(index)} className={`min-h-10 flex-1 rounded-lg border text-sm font-bold ${page===index?'border-primary bg-primary/15 text-primary':'border-border'}`}>{index+1}</button>)}</div><p className="mt-2 text-xs text-text-secondary">All fixtures are preserved across {pages} downloadable pages.</p></div>}
            <button type="button" onClick={download} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 font-black"><Download className="h-4 w-4"/>Download PNG</button>
            <p role="status" className="text-xs text-text-secondary">{status} Output: 1080 × 1350 PNG.</p>
          </aside>
          <div className="flex min-h-0 items-start justify-center overflow-auto bg-black/30 p-4 sm:p-7"><canvas ref={canvasRef} aria-label={`${POSTER_TEMPLATES.find((item)=>item.id===template)?.name} fixture poster preview`} className="h-auto w-full max-w-[648px] bg-black shadow-2xl" style={{aspectRatio:'4 / 5'}}/></div>
        </div>
      </div>
    </div>}
  </>;
}
