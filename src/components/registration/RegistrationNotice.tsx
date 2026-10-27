import { createClient } from '@/lib/supabase/server';

type Status = {
  closes_at: string | null; timezone: string; open: boolean; max_players: number | null; player_spots_left: number | null; waitlist: number;
  max_teams: number | null; teams: number; born_on_or_after: string | null; born_on_or_before: string | null;
};

const day = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** The deadline, places left and who may play, shown before registering. Renders nothing when there is nothing to say. */
export async function RegistrationNotice({ tournamentId, kind }: { tournamentId: string; kind: 'PLAYER' | 'TEAM' }) {
  const supabase = (await createClient()) as unknown as { rpc: (n: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown }> };
  const { data } = await supabase.rpc('get_registration_status', { p_tournament_id: tournamentId });
  const s = data as Status | null;
  if (!s) return null;
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: s.timezone });
  const lines: string[] = [];
  if (s.closes_at) lines.push(new Date(s.closes_at) > new Date() ? `Registration closes on ${when(s.closes_at)}.` : `Registration closed on ${when(s.closes_at)}.`);
  if (kind === 'PLAYER') {
    if (s.max_players) lines.push(s.player_spots_left ? `${s.player_spots_left} of ${s.max_players} places left.` : `All ${s.max_players} places are taken. You can still register and join the waitlist${s.waitlist ? ` (${s.waitlist} waiting)` : ''}.`);
    if (s.born_on_or_after && s.born_on_or_before) lines.push(`Open to players born between ${day(s.born_on_or_after)} and ${day(s.born_on_or_before)}.`);
    else if (s.born_on_or_after) lines.push(`Open to players born on or after ${day(s.born_on_or_after)}.`);
    else if (s.born_on_or_before) lines.push(`Open to players born on or before ${day(s.born_on_or_before)}.`);
  } else if (s.max_teams) lines.push(s.teams < s.max_teams ? `${s.max_teams - s.teams} of ${s.max_teams} team places left.` : 'All team places are taken.');
  if (lines.length === 0) return null;
  return (
    <div className="mb-6 rounded-2xl border border-border bg-surface p-4 text-sm text-text-secondary" role="note">
      {lines.map((l) => <p key={l}>{l}</p>)}
    </div>
  );
}
