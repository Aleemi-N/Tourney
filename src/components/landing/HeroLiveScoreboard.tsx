'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { TickNumber, useTicker } from './LandingMotion';

type Side = 0 | 1;
const TEAMS = ['Blue Spikers', 'Coast Smash'];

type Match = { points: [number, number]; sets: [number, number]; set: number; serving: Side; last: Side | null };

const START: Match = { points: [18, 16], sets: [1, 0], set: 2, serving: 0, last: null };

/** One rally: the winner scores and serves; 25 points with a 2-point lead takes the set; 3 sets take the match. */
export function playRally(m: Match, winner: Side): Match {
  const points: [number, number] = [...m.points];
  points[winner]++;
  const lead = points[winner] - points[winner === 0 ? 1 : 0];
  if (points[winner] < 25 || lead < 2) return { ...m, points, serving: winner, last: winner };
  const sets: [number, number] = [...m.sets];
  sets[winner]++;
  if (sets[winner] === 3) return { ...START, last: null };
  return { points: [0, 0], sets, set: m.set + 1, serving: winner, last: winner };
}

/** A sample scoreboard that plays itself point by point — always in the dark TV look, in both themes. */
export function HeroLiveScoreboard() {
  const [match, setMatch] = useState(START);
  const ref = useTicker(() => setMatch((m) => playRally(m, Math.random() < 0.55 ? m.serving : (m.serving === 0 ? 1 : 0))), 1800);

  return (
    <div ref={ref} data-theme="dark" className="relative w-full max-w-md rounded-3xl border border-border bg-surface p-5 text-text-primary shadow-overlay">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 rounded-full border border-live/30 bg-live/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-live">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-75 motion-reduce:hidden" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
          </span>
          Live
        </span>
        <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">Sample match · Set {match.set}</span>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {TEAMS.map((team, i) => {
          const side = i as Side;
          const leading = match.points[side] > match.points[side === 0 ? 1 : 0];
          return (
            <motion.div
              key={team}
              animate={match.last === side ? { scale: [1, 1.02, 1] } : {}}
              transition={{ duration: 0.4 }}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 transition-colors ${leading ? 'border-primary/50 bg-primary/10' : 'border-border bg-surface-muted'}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${match.serving === side ? 'bg-warning' : 'bg-transparent'}`} aria-label={match.serving === side ? 'Serving' : undefined} />
                <span className="truncate text-base font-bold">{team}</span>
                <span className="shrink-0 whitespace-nowrap rounded-md bg-background px-1.5 py-0.5 text-xs font-bold text-text-secondary">
                  Sets <TickNumber value={match.sets[side]} />
                </span>
              </div>
              <TickNumber value={match.points[side]} className="shrink-0 text-4xl font-black tabular-nums" />
            </motion.div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-text-muted">
        <span>Every point, the moment it happens</span>
        <span className="font-semibold text-primary">Best of 5</span>
      </div>
    </div>
  );
}
