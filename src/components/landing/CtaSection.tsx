import React from 'react';
import Link from 'next/link';
import { CourtLineBackground } from './CourtLineBackground';
import { Reveal } from './LandingMotion';
import { VolleyballBall } from './VolleyballBall';

export function CtaSection() {
  return (
    <section className="relative w-full overflow-hidden border-t border-border bg-background py-20 lg:py-28">
      <CourtLineBackground className="opacity-50" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[400px] w-full max-w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[100px]" />

      <VolleyballBall className="pointer-events-none absolute -left-16 top-10 h-48 w-48 animate-[spin_24s_linear_infinite] opacity-30 motion-reduce:animate-none sm:h-64 sm:w-64" />
      <VolleyballBall className="pointer-events-none absolute -bottom-12 -right-10 h-40 w-40 animate-[spin_18s_linear_infinite_reverse] opacity-20 motion-reduce:animate-none" />
      <Reveal className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-4xl font-black tracking-tight text-text-primary md:text-6xl">Ready for your next tournament?</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-text-secondary">Set it up in minutes. Your teams, players and fans take it from there.</p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/organizer/tournaments/new" className="inline-flex h-14 items-center justify-center rounded-xl bg-primary px-8 font-bold text-primary-foreground shadow-card transition hover:-translate-y-0.5 hover:bg-primary-hover">
            Create tournament
          </Link>
          <Link href="#tournaments" className="inline-flex h-14 items-center justify-center rounded-xl border border-border-strong px-8 font-bold text-text-primary transition hover:bg-surface-muted">
            Explore tournaments
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
