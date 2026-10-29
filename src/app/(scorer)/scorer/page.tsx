import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/api/server';
import { ScorerShell } from '@/components/scorer/ScorerShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { CalendarClock } from 'lucide-react';
import { StatusPill } from '@/components/ui/StatusPill';

export const metadata: Metadata = { title: 'Assigned Matches' };

export default async function ScorerHomePage() {
  const api = await createClient();
  const { data: { user } } = await api.auth.getUser();
  if (!user) redirect('/login');
  const { data: assignments } = await api.from('match_scorers').select('match_id').eq('user_id', user.id);
  const matches = await Promise.all((assignments ?? []).map(async (assignment) => {
    const { data } = await api.rpc('get_scorer_match_state', { p_match_id: assignment.match_id });
    return data as { match: { id: string; status: string; match_number: number | null; venue: string | null }; home_team: { name: string }; away_team: { name: string } } | null;
  }));

  return (
    <ScorerShell>
      <div className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary/70">
          Scorer workspace
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-text-primary sm:text-4xl">
          Assigned matches
        </h1>
        <p className="mt-3 text-base leading-7 text-text-secondary font-medium">
          Only matches assigned to your account appear here. Point actions remain authorized by the scoring RPC.
        </p>
        
        <div className="mt-8 space-y-4">
          {matches.filter(Boolean).map((match) =>
            match ? (
              <Link
                key={match.match.id}
                href={`/scorer/matches/${match.match.id}`}
                className="block rounded-2xl border border-border bg-surface p-5 shadow-card transition-colors hover:border-primary/40 sm:p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary/70">
                      Match {match.match.match_number ?? '—'}
                    </p>
                    <h2 className="mt-2 break-words text-xl font-black text-text-primary sm:text-2xl">
                      {match.home_team.name} <span className="text-text-muted font-medium mx-1">vs</span> {match.away_team.name}
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-text-secondary">
                      {match.match.venue ?? 'Venue pending'}
                    </p>
                  </div>
                  <StatusPill status={match.match.status} />
                </div>
              </Link>
            ) : null
          )}
          {matches.filter(Boolean).length === 0 ? (
            <EmptyState
              title="No assigned matches"
              description="When an organizer assigns you to a match, it will appear here automatically."
              icon={<CalendarClock className="h-6 w-6 text-primary" />}
            />
          ) : null}
        </div>
      </div>
    </ScorerShell>
  );
}
