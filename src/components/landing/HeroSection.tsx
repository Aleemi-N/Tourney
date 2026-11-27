import React from 'react';
import Link from 'next/link';
import { LandingPhoto } from './LandingPhoto';
import { PHOTOS } from './photos';
import { Smartphone } from 'lucide-react';
import { createClient } from '@/lib/api/server';
import { CourtLineBackground } from './CourtLineBackground';
import { HeroCourtScene } from './HeroCourtScene';
import { HeroHeadline } from './HeroHeadline';
import { CountUp, Reveal } from './LandingMotion';
import { APP_CONFIG } from '@/lib/config';

async function publicCounts() {
  const api = await createClient();
  const head = { count: 'exact' as const, head: true };
  const [tournaments, teams, players] = await Promise.all([
    api.from('tournaments').select('id', head).eq('is_public', true),
    api.from('teams').select('id', head),
    api.from('player_profiles').select('id', head),
  ]);
  return [
    { label: 'Tournaments', value: tournaments.count ?? 0 },
    { label: 'Teams', value: teams.count ?? 0 },
    { label: 'Players', value: players.count ?? 0 },
  ].filter((s) => s.value > 0);
}

export async function HeroSection() {
  const stats = await publicCounts();

  return (
    <section className="relative w-full overflow-hidden bg-background">
      <LandingPhoto src={PHOTOS.heroSpike.src} alt="" fill preload sizes="100vw" className="landing-kenburns object-cover opacity-20 grayscale dark:opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />
      <CourtLineBackground />
      <div className="landing-drift pointer-events-none absolute -left-40 -top-40 h-[520px] w-[620px] rounded-full bg-primary/20 blur-[120px]" />
      <div className="landing-drift pointer-events-none absolute -right-40 top-40 h-[420px] w-[520px] rounded-full bg-info/15 blur-[120px] [animation-delay:-7s]" />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-16 pt-12 sm:px-6 md:pt-20 lg:grid-cols-2 lg:px-8 lg:pb-24">
        <div className="flex flex-col gap-6 text-center lg:text-left">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
              Volleyball tournaments, start to finish
            </span>
          </Reveal>

          <HeroHeadline />

          <Reveal delay={0.1}>
            <p className="mx-auto max-w-xl text-lg text-text-secondary md:text-xl lg:mx-0">
              Registrations, live player auctions, lot draw, fixtures, point-by-point scoring and standings — one platform for organizers, teams, players, scorers and fans.
            </p>
          </Reveal>

          <Reveal delay={0.15} className="flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
            <Link href="/organizer/tournaments/new" className="inline-flex h-14 items-center justify-center rounded-xl bg-primary px-8 font-bold text-primary-foreground shadow-card transition hover:-translate-y-0.5 hover:bg-primary-hover">
              Create tournament
            </Link>
            <a href={APP_CONFIG.playStoreUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface px-6 font-bold text-text-primary transition hover:-translate-y-0.5 hover:bg-surface-muted">
              <Smartphone className="h-5 w-5 text-primary" aria-hidden="true" />
              Get it on Google Play
            </a>
          </Reveal>

          {stats.length > 0 && (
            <Reveal delay={0.2}>
              <dl className="mx-auto mt-2 flex max-w-md divide-x divide-border rounded-2xl border border-border bg-surface/70 py-4 shadow-card backdrop-blur lg:mx-0">
                {stats.map((s) => (
                  <div key={s.label} className="flex flex-1 flex-col-reverse items-center gap-1 px-2">
                    <dt className="text-xs font-semibold uppercase tracking-widest text-text-muted">{s.label}</dt>
                    <dd className="text-3xl font-black text-text-primary"><CountUp value={s.value} /></dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          )}
        </div>

        <HeroCourtScene />
      </div>
    </section>
  );
}
