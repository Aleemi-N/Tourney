import { NextResponse } from 'next/server';
import { createClient } from '@/lib/api/server';

const ID = /^[0-9a-f-]{36}$/i;

/**
 * Where a tapped notification goes. The alert only carries ids; this finds the public page for them
 * (a match, a team, or the tournament) and redirects there, falling back to the home page.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const matchId = url.searchParams.get('matchId') ?? '';
  const teamId = url.searchParams.get('teamId') ?? '';
  const tournamentId = url.searchParams.get('tournamentId') ?? '';
  const kind = url.searchParams.get('kind') ?? '';
  const api = await createClient();
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  // Payment alerts: the organizer goes to the Payments page, the payer to their account.
  if ((kind === 'PAYMENT_SUBMITTED' || kind === 'PAYMENT_RECEIVED') && ID.test(tournamentId)) return to(`/organizer/tournaments/${tournamentId}/payments`);
  if (kind === 'PAYMENT_CONFIRMED' || kind === 'PAYMENT_REJECTED' || kind === 'PAYMENT_DUE') return to('/player');

  if (ID.test(matchId)) {
    const { data } = await api.from('public_fixture_view').select('tournament_id').eq('id', matchId).maybeSingle();
    if (data?.tournament_id) {
      const { data: t } = await api.from('public_tournament_view').select('slug').eq('id', data.tournament_id).maybeSingle();
      if (t?.slug) return to(`/t/${t.slug}/match/${matchId}`);
    }
  }
  if (ID.test(tournamentId) || ID.test(teamId)) {
    let id = tournamentId;
    if (!ID.test(id)) {
      const { data } = await api.from('public_team_view').select('tournament_id').eq('id', teamId).maybeSingle();
      id = data?.tournament_id ?? '';
    }
    if (ID.test(id)) {
      const { data: t } = await api.from('public_tournament_view').select('slug').eq('id', id).maybeSingle();
      if (t?.slug) return to(`/t/${t.slug}`);
    }
  }
  return to('/');
}
