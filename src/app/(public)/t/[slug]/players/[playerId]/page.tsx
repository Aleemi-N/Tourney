import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/api/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';
import { TournamentNotFound } from '@/components/public/TournamentNotFound';
import { StatsView, type Stats } from '@/components/public/StatsView';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';

type Props = { params: Promise<{ slug: string; playerId: string }> };
type PlayerStats = {
  player: { id: string; display_name: string; photo_path: string | null; primary_position: string | null; secondary_position: string | null; height_cm: number | null };
  teams: Array<{ team_id: string; team_name: string; tournament_slug: string; tournament_name: string }>;
  stats: Stats;
};

export default async function PublicPlayerStatsPage({ params }: Props) {
  const { slug, playerId } = await params;
  const tournament = await getTournamentHeader(slug);
  if (!tournament) return <TournamentNotFound />;

  const api = await createClient();
  const { data, error } = await api.rpc('get_player_stats', { p_player_id: playerId });
  if (error || !data) notFound();
  const { player, teams, stats } = data as unknown as PlayerStats;
  const photoUrl = player.photo_path ? api.storage.from('player-photos').getPublicUrl(player.photo_path).data.publicUrl : null;

  return (
    <PublicTournamentFrame slug={slug} name={tournament.name} logoUrl={tournament.logoUrl} status={tournament.status}>
      <Link href={`/t/${slug}/players`} className="text-sm font-medium text-text-secondary hover:text-text-primary">← All players</Link>
      <div className="mb-8 mt-4 flex items-center gap-4">
        {photoUrl ? (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border">
            <Image src={photoUrl} alt={player.display_name} fill sizes="64px" className="object-cover" unoptimized />
          </div>
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-black text-primary">{player.display_name.charAt(0).toUpperCase()}</div>
        )}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Player statistics</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{player.display_name}</h1>
          <p className="text-sm text-text-muted">
            {[player.primary_position ? formatVolleyballPosition(player.primary_position) : null, player.height_cm ? `${player.height_cm} cm` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      <p className="mb-4 text-sm text-text-secondary">Results of the teams {player.display_name} has been on the squad of. Individual points are not recorded.</p>
      <StatsView stats={stats} />
      {teams.length > 0 ? (
        <p className="mt-6 text-sm text-text-secondary">
          Squads: {teams.map((t, i) => (
            <span key={t.team_id}>{i ? ', ' : ''}<Link href={`/t/${t.tournament_slug}/teams/${t.team_id}`} className="font-semibold text-primary hover:underline">{t.team_name}</Link> ({t.tournament_name})</span>
          ))}
        </p>
      ) : null}
    </PublicTournamentFrame>
  );
}
