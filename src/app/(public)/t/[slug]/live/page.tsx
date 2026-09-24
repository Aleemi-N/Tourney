import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PublicLandingNav } from '@/components/landing/PublicLandingNav';
import { LandingFooter } from '@/components/landing/LandingFooter';
import type { PublicLotState } from '@/lib/lot-draw';
import { PublicLotLive } from './PublicLotLive';

export default async function PublicLivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: tournament } = await supabase.from('tournaments').select('id,name,slug').eq('slug', slug).eq('is_public', true).maybeSingle();
  if (!tournament) return <main className="min-h-screen bg-[#09090e] p-10 text-center text-white"><h1 className="text-2xl font-bold">Tournament not found</h1></main>;
  const { data: events } = await supabase.from('lot_public_events').select('lot_session_id,lot_type,created_at').eq('tournament_id', tournament.id).order('created_at', { ascending: false }).limit(50);
  let initialState: PublicLotState | null = null;
  const latestSessionIds = [...new Set((events ?? []).map((event) => event.lot_session_id))].slice(0, 4);
  const snapshots = await Promise.all(latestSessionIds.map(async (sessionId) => {
    const { data } = await supabase.rpc('get_lot_public_state', { p_lot_session_id: sessionId });
    return data as unknown as PublicLotState | null;
  }));
  initialState = snapshots.find((snapshot) => snapshot && ['PREPARING', 'SHUFFLED', 'LIVE'].includes(snapshot.session.status)) ?? snapshots.find((snapshot) => snapshot?.session.status === 'COMPLETED') ?? null;
  const { data: teams } = await supabase.from('public_team_view').select('id,name,short_name').eq('tournament_id', tournament.id);
  const safeTeams = (teams ?? []).filter((team): team is { id: string; name: string; short_name: string | null } => Boolean(team.id && team.name));
  return <div className="min-h-screen bg-[#09090e] text-white"><PublicLandingNav/><main className="mx-auto max-w-7xl px-4 py-10 sm:px-6"><Link href={`/t/${slug}`} className="text-sm text-slate-400 hover:text-white">← Tournament home</Link><PublicLotLive tournament={tournament} teams={safeTeams} initialState={initialState}/></main><LandingFooter/></div>;
}
