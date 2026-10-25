'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Minus, Plus, RotateCcw, X } from 'lucide-react';

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 900;

type Point = { x: number; y: number };

export function PhotoCropModal({ file, onCancel, onApply }: { file: File; onCancel: () => void; onApply: (file: File) => Promise<void> }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ pointerId: number; start: Point; origin: Point } | null>(null);
  const [sourceUrl] = useState(() => URL.createObjectURL(file));
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const displaySize = (() => {
    if (!naturalSize.width || !viewportSize.width) return { width: 0, height: 0 };
    const coverScale = Math.max(viewportSize.width / naturalSize.width, viewportSize.height / naturalSize.height);
    return { width: naturalSize.width * coverScale * zoom, height: naturalSize.height * coverScale * zoom };
  })();

  const clampOffset = useCallback((point: Point, width = displaySize.width, height = displaySize.height) => ({
    x: Math.max((viewportSize.width - width) / 2, Math.min((width - viewportSize.width) / 2, point.x)),
    y: Math.max((viewportSize.height - height) / 2, Math.min((height - viewportSize.height) / 2, point.y)),
  }), [displaySize.height, displaySize.width, viewportSize.height, viewportSize.width]);

  const effectiveOffset = clampOffset(offset);

  function reset() {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: effectiveOffset };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset(clampOffset({ x: drag.origin.x + event.clientX - drag.start.x, y: drag.origin.y + event.clientY - drag.start.y }));
  }

  async function applyCrop() {
    const image = imageRef.current;
    if (!image || !displaySize.width || !viewportSize.width) return;
    setProcessing(true);
    setError(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Photo processing is not supported in this browser.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      const ratio = OUTPUT_WIDTH / viewportSize.width;
      context.drawImage(
        image,
        (viewportSize.width - displaySize.width) / 2 * ratio + effectiveOffset.x * ratio,
        (viewportSize.height - displaySize.height) / 2 * ratio + effectiveOffset.y * ratio,
        displaySize.width * ratio,
        displaySize.height * ratio,
      );
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
      if (!blob) throw new Error('Unable to create the adjusted photo.');
      await onApply(new File([blob], `tourny-profile-${Date.now()}.webp`, { type: 'image/webp' }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to process this photo.');
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-black/80 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="photo-adjust-title">
      <div className="flex max-h-[calc(100svh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-card sm:max-h-[calc(100svh-2rem)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div><h2 id="photo-adjust-title" className="font-bold text-text-primary">Adjust Photo</h2><p className="text-xs text-text-muted">Drag to reposition, then zoom as needed.</p></div>
          <button type="button" onClick={onCancel} disabled={processing} className="rounded-lg p-2 text-text-secondary hover:bg-surface-muted disabled:opacity-50" aria-label="Cancel photo adjustment"><X className="h-5 w-5" /></button>
        </div>

        <div className="min-h-0 overflow-y-auto p-3 sm:p-5">
          <div
            ref={viewportRef}
            className="relative mx-auto aspect-4/3 w-full max-w-[440px] cursor-move touch-none select-none overflow-hidden rounded-xl bg-black ring-1 ring-border"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => { dragRef.current = null; }}
            onPointerCancel={() => { dragRef.current = null; }}
          >
            {/* Canvas needs the decoded source element at its intrinsic resolution. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {sourceUrl && <img ref={imageRef} src={sourceUrl} alt="Photo crop preview" draggable={false} onLoad={(event) => {
              setNaturalSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
              // Free the blob once decoded: the crop draws from this <img>. Revoking in an effect cleanup
              // broke the preview under StrictMode, whose dev remount ran the cleanup before the image loaded.
              URL.revokeObjectURL(sourceUrl);
            }} className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none" style={{ width: displaySize.width, height: displaySize.height, transform: `translate(calc(-50% + ${effectiveOffset.x}px), calc(-50% + ${effectiveOffset.y}px))` }} />}
            <div className="pointer-events-none absolute inset-0 border border-border-strong shadow-card" />
            <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-dashed border-border-strong" /><div className="pointer-events-none absolute inset-y-0 right-1/3 border-l border-dashed border-border-strong" />
            <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-dashed border-border-strong" /><div className="pointer-events-none absolute inset-x-0 bottom-1/3 border-t border-dashed border-border-strong" />
          </div>
          <p className="mt-2 text-center text-xs text-text-muted">This 4:3 frame matches the Tourny player card.</p>

          <div className="mt-4 flex items-center gap-3">
            <button type="button" onClick={() => setZoom((value) => Math.max(1, +(value - 0.1).toFixed(1)))} disabled={zoom <= 1 || processing} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-text-primary disabled:opacity-40" aria-label="Zoom out"><Minus className="h-5 w-5" /></button>
            <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} disabled={processing} className="min-w-0 flex-1 accent-primary" aria-label="Photo zoom" />
            <button type="button" onClick={() => setZoom((value) => Math.min(3, +(value + 0.1).toFixed(1)))} disabled={zoom >= 3 || processing} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border text-text-primary disabled:opacity-40" aria-label="Zoom in"><Plus className="h-5 w-5" /></button>
          </div>
          {error && <p role="alert" className="mt-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p>}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-surface px-3 py-3 sm:px-5">
          <button type="button" onClick={reset} disabled={processing} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-text-secondary hover:bg-surface-muted disabled:opacity-50"><RotateCcw className="h-4 w-4" />Reset</button>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onCancel} disabled={processing} className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text-secondary disabled:opacity-50">Cancel</button>
            <button type="button" onClick={applyCrop} disabled={processing || !naturalSize.width} className="flex min-h-11 min-w-28 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-50">{processing && <Loader2 className="h-4 w-4 animate-spin" />}{processing ? 'Applying…' : 'Apply Crop'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
