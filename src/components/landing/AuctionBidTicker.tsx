'use client';

import React, { useState } from 'react';
import { TickNumber, useTicker } from './LandingMotion';

const BIDDERS = ['Blue Spikers', 'Coast Smash', 'Net Kings'];
const START = { amount: 5000, bidder: 0 };

/** A sample auction lot whose bid climbs by itself while on screen. */
export function AuctionBidTicker() {
  const [bid, setBid] = useState(START);
  const ref = useTicker(() => setBid((b) => (b.amount >= 15000 ? START : { amount: b.amount + 500, bidder: (b.bidder + 1 + Math.floor(Math.random() * 2)) % BIDDERS.length })), 1400);

  return (
    <div ref={ref} className="flex items-center justify-between gap-4 rounded-2xl bg-surface-muted p-4" aria-hidden="true">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">Current bid</p>
        <p className="text-3xl font-black text-text-primary">
          ₹<TickNumber value={bid.amount.toLocaleString('en-IN')} />
        </p>
      </div>
      <div className="min-w-0 text-right">
        <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">Highest bidder</p>
        <p className="truncate font-bold text-primary">{BIDDERS[bid.bidder]}</p>
      </div>
    </div>
  );
}
