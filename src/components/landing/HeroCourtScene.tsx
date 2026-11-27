'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { HeroLiveScoreboard } from './HeroLiveScoreboard';
import { VolleyballBall } from './VolleyballBall';

const RALLY = { duration: 3.2, repeat: Infinity, ease: 'easeInOut' as const };
// The ball's path: served from the left, over the net, dug on the right, back over.
const BALL_X = [-150, -20, 130, 20, -150];
const BALL_Y = [40, -190, 30, -170, 40];

function FloatIn({ children, delay, className }: { children: React.ReactNode; delay: number; className: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, type: 'spring', stiffness: 120, damping: 16 }}
    >
      <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay }}>
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Hero illustration: a 3D court with a rally going over the net, plus floating product cards. */
export function HeroCourtScene() {
  return (
    <div className="relative mx-auto h-[460px] w-full max-w-xl sm:h-[560px]" aria-hidden="true">
      {/* Court in perspective */}
      <div className="absolute inset-x-0 bottom-6 flex justify-center [perspective:900px]">
        <div className="relative h-[300px] w-[440px] max-w-[95%] [transform:rotateX(58deg)] rounded-md border-2 border-primary/50 bg-primary/10 shadow-overlay">
          <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-primary/70" />
          <div className="absolute inset-x-0 top-[33%] h-px bg-primary/40" />
          <div className="absolute inset-x-0 top-[67%] h-px bg-primary/40" />
        </div>
      </div>
      {/* Net */}
      <div className="absolute bottom-[115px] left-1/2 h-16 w-[400px] max-w-[92%] -translate-x-1/2 border-t-4 border-text-primary/80 bg-[repeating-linear-gradient(90deg,var(--border-strong)_0_1px,transparent_1px_12px),repeating-linear-gradient(0deg,var(--border-strong)_0_1px,transparent_1px_12px)] opacity-80" />
      <div className="absolute bottom-[60px] left-[calc(50%-205px)] hidden h-[120px] w-1.5 rounded bg-text-secondary sm:block" />
      <div className="absolute bottom-[60px] right-[calc(50%-205px)] hidden h-[120px] w-1.5 rounded bg-text-secondary sm:block" />

      {/* Ball shadow on the court, then the ball */}
      <motion.div
        className="absolute bottom-[72px] left-1/2 h-4 w-14 -ml-7 rounded-full bg-text-primary/20 blur-sm"
        animate={{ x: BALL_X, scale: [1, 0.5, 1, 0.55, 1], opacity: [0.7, 0.25, 0.7, 0.3, 0.7] }}
        transition={RALLY}
      />
      <motion.div
        className="absolute bottom-[80px] left-1/2 z-30 -ml-8 h-16 w-16 drop-shadow-xl"
        animate={{ x: BALL_X, y: BALL_Y, rotate: [0, 200, 400, 600, 720] }}
        transition={RALLY}
      >
        <VolleyballBall className="h-full w-full" />
      </motion.div>

      {/* Floating product cards */}
      <FloatIn delay={0.3} className="absolute right-0 top-4 w-[330px] origin-top-right scale-[0.8] sm:scale-100">
        <HeroLiveScoreboard />
      </FloatIn>

      <FloatIn delay={0.6} className="absolute left-0 top-[170px] z-10 w-[220px] origin-top-left scale-[0.85] sm:top-[200px] sm:scale-100">
        <div className="rounded-2xl border border-border bg-surface/90 p-4 shadow-overlay backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-info text-lg font-black text-primary-foreground">AK</div>
            <div className="min-w-0">
              <p className="truncate font-bold text-text-primary">Arjun K.</p>
              <p className="text-xs text-text-muted">Setter · Icon lot</p>
            </div>
          </div>
          <div className="relative mt-3 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-text-muted">Final bid</p>
              <p className="numeric-display text-2xl font-black text-text-primary">₹12,500</p>
            </div>
            <motion.span
              className="rounded-lg border-2 border-success px-2 py-0.5 text-sm font-black uppercase tracking-widest text-success"
              animate={{ scale: [2.2, 1, 1, 1], opacity: [0, 1, 1, 0], rotate: [-25, -12, -12, -12] }}
              transition={{ duration: 3.5, times: [0, 0.12, 0.85, 1], repeat: Infinity, repeatDelay: 0.6 }}
            >
              Sold
            </motion.span>
          </div>
        </div>
      </FloatIn>

      <FloatIn delay={0.9} className="absolute left-0 top-0 hidden w-[230px] lg:block">
        <div className="flex gap-3 rounded-2xl border border-border bg-surface/90 p-3 shadow-overlay backdrop-blur">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary"><Bell className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-text-primary">Your match is next</p>
            <p className="truncate text-xs text-text-muted">Court 1 · Quarter-final</p>
          </div>
        </div>
      </FloatIn>
    </div>
  );
}
