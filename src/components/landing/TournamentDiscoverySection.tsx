import React from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TournamentDiscoveryCard, DiscoveryTournamentProps } from './TournamentDiscoveryCard';
import { VolleyballIcon } from './VolleyballIcon';

export async function TournamentDiscoverySection() {
  const supabase = await createClient();
  
  // Safe public query based on is_public flag and open statuses
  const { data: tournaments } = await supabase
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
    .in('status', ['REGISTRATION', 'PREPARATION', 'LIVE', 'COMPLETED'])
    .order('created_at', { ascending: false })
    .limit(6);

  return (
    <section id="tournaments" className="w-full py-12 lg:py-16 bg-background border-y border-border relative z-10 scroll-mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <h2 className="text-3xl font-extrabold text-text-primary tracking-tight">Live & Upcoming Tournaments</h2>
            <p className="text-text-secondary mt-2 text-lg">Find your next competition or spectate live action.</p>
            <Link href="/tournaments" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 font-semibold text-text-primary hover:bg-surface-muted">Search all tournaments &rarr;</Link>
          </div>
        </div>

        {!tournaments || tournaments.length === 0 ? (
          <div className="w-full py-16 flex flex-col items-center justify-center border border-dashed border-border rounded-3xl bg-surface">
            <VolleyballIcon className="w-12 h-12 text-text-muted mb-4 opacity-50" />
            <h3 className="text-lg font-bold text-text-primary mb-1">No tournaments right now.</h3>
            <p className="text-text-secondary text-sm mb-6">Be the first to start a new competition.</p>
            <Link 
              href="/organizer/tournaments/new"
              className="px-6 py-2.5 bg-surface-muted hover:bg-surface-muted text-text-primary font-semibold rounded-xl transition-colors text-sm"
            >
              Create Tournament &rarr;
            </Link>
          </div>
        ) : (
          <div className="flex overflow-x-auto pb-8 -mx-4 px-4 sm:mx-0 sm:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 gap-6 snap-x snap-mandatory scrollbar-none">
            {tournaments.map(t => (
              <TournamentDiscoveryCard key={t.id} tournament={t as DiscoveryTournamentProps['tournament']} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
