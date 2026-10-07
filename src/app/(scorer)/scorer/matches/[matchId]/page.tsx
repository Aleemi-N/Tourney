import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { ScorerShell } from '@/components/scorer/ScorerShell';
import { ScorerMatchClient } from '@/components/scorer/ScorerMatchClient';
import { EmptyState } from '@/components/ui/EmptyState';

export const metadata: Metadata = { title: 'Live Match Scoring' };

export default async function ScorerMatchPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/scorer/matches/${matchId}`);
  const { data, error } = await supabase.rpc('get_scorer_match_state', { p_match_id: matchId });
  if (error || !data) {
    const unauthorized = error?.message.includes('Unauthorized');
    return (
      <ScorerShell>
        <EmptyState
          icon={<ShieldAlert className="h-6 w-6 text-primary" />}
          title={unauthorized ? 'Someone else is scoring this match' : 'Match not ready for scoring'}
          description={unauthorized
            ? `This link was already opened by another scorer account. Ask the organizer to assign ${user.email ?? 'your account'} under “Schedule & Assign Scorer”, then open the link again.`
            : 'This match was not found, or its teams are not decided yet.'}
        />
      </ScorerShell>
    );
  }
  return <ScorerShell><ScorerMatchClient initialState={data as never} /></ScorerShell>;
}
