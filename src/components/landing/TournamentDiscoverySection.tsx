import React from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/api/server';
import { TournamentDiscoveryCard, DiscoveryTournamentProps } from './TournamentDiscoveryCard';
import { VolleyballIcon } from './VolleyballIcon';
import { Reveal } from './LandingMotion';

export const DISCOVERY_STATUSES = ['LIVE', 'REGISTRATION', 'PREPARATION'];

export async function TournamentDiscoverySection() {
  const api = await createClient();
  
  // Live, registration-open and upcoming only: completed tournaments live on /tournaments.
  const { data: tournaments } = await api
    .from('tournaments')
    .select(`
      id, 
      slug, 
      name, 
      status, 
      start_date, 
      venue, 
      format, 
      league_mode,
      tournament_branding (logo_path),
      tournament_settings (
        player_registration_enabled,
        team_registration_enabled
      )
    `)
    .eq('is_public', true)
    .in('status', DISCOVERY_STATUSES)
    .order('created_at', { ascending: false })
    .limit(6);

  return (
    <section id="tournaments" className="relative z-10 w-full scroll-mt-20 bg-background py-16 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Reveal className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-primary">On now</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-text-primary md:text-5xl">Live &amp; upcoming tournaments</h2>
            <p className="mt-3 text-lg text-text-secondary">Join one that is open for registration, or watch the action live.</p>
          </div>
          <Link href="/tournaments" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-border-strong px-4 font-semibold text-text-primary transition hover:bg-surface-muted">All tournaments &rarr;</Link>
        </Reveal>

        {!tournaments || tournaments.length === 0 ? (
          <div className="w-full py-16 flex flex-col items-center justify-center border border-dashed border-border rounded-3xl bg-surface">
            <VolleyballIcon className="w-12 h-12 text-text-muted mb-4 opacity-50" />
            <h3 className="text-lg font-bold text-text-primary mb-1">Nothing live or open right now.</h3>
            <p className="text-text-secondary text-sm mb-6">See past tournaments, or start the next one.</p>
            <Link 
              href="/organizer/tournaments/new"
              className="px-6 py-2.5 bg-surface-muted hover:bg-surface-muted text-text-primary font-semibold rounded-xl transition-colors text-sm"
            >
              Create Tournament &rarr;
            </Link>
          </div>
        ) : (
          <div className="flex overflow-x-auto pb-8 -mx-4 px-4 sm:mx-0 sm:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 gap-6 snap-x snap-mandatory scrollbar-none">
            {tournaments.map((t, i) => (
              <Reveal key={t.id} delay={i * 0.06} className="shrink-0 snap-start">
                <TournamentDiscoveryCard tournament={t as DiscoveryTournamentProps['tournament']} />
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
