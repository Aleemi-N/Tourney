import React from 'react';
import { VolleyballIcon } from './VolleyballIcon';

const ITEMS = ['Live scoring', 'Player auctions', 'Lot draw', 'Fixtures', 'Standings', 'Certificates', 'Jersey export', 'Notifications', 'Android app'];

/** An endless strip of feature names; the list is drawn twice so the loop has no seam. */
export function FeatureMarquee() {
  return (
    <div className="relative -rotate-1 overflow-hidden border-y border-primary/40 bg-primary py-4 text-primary-foreground shadow-overlay" aria-label={ITEMS.join(', ')}>
      <div className="landing-marquee flex w-max" aria-hidden="true">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center">
            {ITEMS.map((item) => (
              <span key={item} className="flex items-center gap-6 px-6 text-xl font-black uppercase tracking-wider sm:text-2xl">
                {item}
                <VolleyballIcon className="h-6 w-6 opacity-70" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
