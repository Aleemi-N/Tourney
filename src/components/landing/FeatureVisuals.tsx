'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TickNumber, useTicker } from './LandingMotion';

const LOTS = ['BS', 'CS', 'NK'];

/** Three face-down lot cards that turn over one at a time. */
export function LotDrawVisual() {
  const [shown, setShown] = useState(0);
  const ref = useTicker(() => setShown((n) => (n + 1) % (LOTS.length + 1)), 1300);
  return (
    <div ref={ref} className="flex justify-center gap-3 [perspective:600px]" aria-hidden="true">
      {LOTS.map((lot, i) => (
        <motion.div key={lot} className="relative h-20 w-14 transform-3d" animate={{ rotateY: i < shown ? 180 : 0 }} transition={{ type: 'spring', stiffness: 160, damping: 18 }}>
          <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-primary/40 bg-gradient-to-br from-primary to-info backface-hidden">
            <span className="text-xl font-black text-primary-foreground">?</span>
          </div>
          <div className="absolute inset-0 flex rotate-y-180 items-center justify-center rounded-xl border border-border bg-surface-muted backface-hidden">
            <span className="font-black text-primary">{lot}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

const TEAMS = [
  { name: 'Blue Spikers', pts: 9 },
  { name: 'Coast Smash', pts: 7 },
  { name: 'Net Kings', pts: 6 },
];

/** A small standings table where a team wins a match and climbs. */
export function StandingsVisual() {
  const [rows, setRows] = useState(TEAMS);
  const ref = useTicker(() => setRows((r) => {
    const won = r.map((t, i) => (i === r.length - 1 ? { ...t, pts: t.pts + 3 } : t));
    return won.some((t) => t.pts > 15) ? TEAMS : [...won].sort((a, b) => b.pts - a.pts);
  }), 1800);
  return (
    <div ref={ref} className="flex w-full max-w-[220px] flex-col gap-1.5" aria-hidden="true">
      {rows.map((t, i) => (
        <motion.div layout key={t.name} transition={{ type: 'spring', stiffness: 300, damping: 30 }} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-sm ${i === 0 ? 'bg-primary/15 font-bold text-text-primary' : 'bg-surface-muted text-text-secondary'}`}>
          <span className="truncate">{i + 1}. {t.name}</span>
          <TickNumber value={t.pts} className="font-bold" />
        </motion.div>
      ))}
    </div>
  );
}

const JERSEYS = [{ name: 'ARJUN', no: 7 }, { name: 'RIYA', no: 11 }, { name: 'SAM', no: 4 }];

/** A jersey whose name and number change, like rows of the export sheet. */
export function JerseyVisual() {
  const [i, setI] = useState(0);
  const ref = useTicker(() => setI((n) => (n + 1) % JERSEYS.length), 1600);
  return (
    <div ref={ref} className="relative mx-auto h-24 w-24" aria-hidden="true">
      <svg viewBox="0 0 100 100" className="h-full w-full fill-primary">
        <path d="M30 8 L42 4 Q50 12 58 4 L70 8 L96 26 L84 44 L74 38 L74 96 L26 96 L26 38 L16 44 L4 26 Z" />
      </svg>
      <div className="absolute inset-x-0 top-8 flex flex-col items-center text-primary-foreground">
        <TickNumber value={JERSEYS[i].name} className="text-xs font-bold tracking-widest" />
        <TickNumber value={JERSEYS[i].no} className="text-3xl font-black leading-none" />
      </div>
    </div>
  );
}

/** A certificate with a light sweep across it. */
export function CertificateVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[200px] overflow-hidden rounded-xl border-2 border-warning/50 bg-surface-muted p-3 text-center" aria-hidden="true">
      <p className="text-xs font-bold uppercase tracking-widest text-warning">Certificate</p>
      <p className="mt-1 text-sm font-black text-text-primary">Best Setter</p>
      <div className="mx-auto mt-2 h-1 w-16 rounded bg-warning/40" />
      <motion.div
        className="absolute inset-y-0 w-12 -skew-x-12 bg-gradient-to-r from-transparent via-warning/30 to-transparent"
        animate={{ x: [-80, 260] }}
        transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
      />
    </div>
  );
}
