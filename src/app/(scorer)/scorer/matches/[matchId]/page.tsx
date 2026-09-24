import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ScorerShell } from '@/components/scorer/ScorerShell';
import { ScorerMatchClient } from '@/components/scorer/ScorerMatchClient';

export const metadata: Metadata = { title: 'Live Match Scoring' };

export default async function ScorerMatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data, error } = await supabase.rpc('get_scorer_match_state', { p_match_id: matchId });
  if (error || !data) notFound();
  return <ScorerShell><ScorerMatchClient initialState={data as never} /></ScorerShell>;
}