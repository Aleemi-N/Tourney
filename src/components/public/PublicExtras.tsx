'use client';

import { Video } from 'lucide-react';
import { SponsorStrip, usePublicExtras } from './SponsorStrip';

/** "Watch live" when the organizer set a stream link. Renders nothing otherwise. */
export function WatchLive({ slug }: { slug: string }) {
  const extras = usePublicExtras(slug);
  if (!extras?.stream_url) return null;
  return (
    <a href={extras.stream_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-live px-4 text-sm font-bold text-text-inverse hover:opacity-90">
      <Video className="h-4 w-4" aria-hidden="true" />Watch live
    </a>
  );
}

/** The sponsors of the tournament. Renders nothing when there are none. */
export function SponsorsSection({ slug }: { slug: string }) {
  const extras = usePublicExtras(slug);
  if (!extras || extras.sponsors.length === 0) return null;
  return (
    <section aria-label="Sponsors" className="mt-12 border-t border-border pt-8">
      <p className="mb-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-text-muted">Our sponsors</p>
      <SponsorStrip sponsors={extras.sponsors} />
    </section>
  );
}
