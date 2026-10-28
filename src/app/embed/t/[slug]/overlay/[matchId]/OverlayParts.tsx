'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SponsorStrip, usePublicExtras } from '@/components/public/SponsorStrip';

/** Re-reads the score every few seconds. */
export function OverlayRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}

/** Sponsor logos under the scoreboard, on a dark panel so they read on any video. */
export function OverlaySponsors({ slug }: { slug: string }) {
  const extras = usePublicExtras(slug);
  if (!extras || extras.sponsors.length === 0) return null;
  return (
    <div className="mx-auto mt-3 w-full max-w-3xl rounded-xl px-4 py-2" style={{ background: 'rgba(255,255,255,0.92)' }}>
      <SponsorStrip sponsors={extras.sponsors} compact />
    </div>
  );
}
