import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/api/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';
import { TournamentNotFound } from '@/components/public/TournamentNotFound';
import { StatsView, type Stats } from '@/components/public/StatsView';
import { teamColorStyle } from '@/lib/utils';

type Props = { params: Promise<{ slug: string; teamId: string }> };
type TeamStats = { team: { id: string; name: string; short_name: string | null; logo_path: string | null; place: string | null; primary_color: string | null }; stats: Stats };

export default async function PublicTeamStatsPage({ params }: Props) {
  const { slug, teamId } = await params;
  const tournament = await getTournamentHeader(slug);
  if (!tournament) return <TournamentNotFound />;

  const api = await createClient();
  const { data, error } = await api.rpc('get_team_stats', { p_team_id: teamId });
  if (error || !data) notFound();
  const { team, stats } = data as unknown as TeamStats;
  const logoUrl = team.logo_path ? api.storage.from('logos').getPublicUrl(team.logo_path).data.publicUrl : null;

  return (
    <PublicTournamentFrame slug={slug} name={tournament.name} logoUrl={tournament.logoUrl} status={tournament.status}>
      <Link href={`/t/${slug}/teams`} className="text-sm font-medium text-text-secondary hover:text-text-primary">← All teams</Link>
      <div className="mb-8 mt-4 flex items-center gap-4">
        {logoUrl ? (
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border bg-surface">
            <Image src={logoUrl} alt={`${team.name} logo`} fill sizes="64px" className="object-contain p-2" unoptimized />
          </div>
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-lg font-black" style={teamColorStyle(team.primary_color)}>
            {(team.short_name ?? team.name).slice(0, 3).toUpperCase()}
          </div>
        )}
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Team statistics</p>
          <h1 className="text-3xl font-extrabold tracking-tight">{team.name}</h1>
          {team.place ? <p className="text-sm text-text-muted">{team.place}</p> : null}
        </div>
      </div>
      <StatsView stats={stats} />
    </PublicTournamentFrame>
  );
}
