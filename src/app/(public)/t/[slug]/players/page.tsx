import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';
import { TournamentNotFound, EmptyState } from '@/components/public/TournamentNotFound';
import { buildTournamentMetadata, TOURNY_PRODUCTION_ORIGIN } from '@/lib/public-tournament-metadata';
import { formatVolleyballPosition } from '@/lib/volleyball-positions';
import Image from 'next/image';
import Link from 'next/link';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = await buildTournamentMetadata(slug, 'players');
  const title = (meta.title as { absolute: string })?.absolute ?? 'Players';
  const description = meta.description ?? 'All approved players.';
  const canonical = new URL(`/t/${slug}/players`, TOURNY_PRODUCTION_ORIGIN);
  return {
    ...meta,
    title: { absolute: title },
    description,
    alternates: { canonical },
    openGraph: {
      ...meta.openGraph,
      title: { absolute: title },
      description,
      url: canonical,
      siteName: 'Tourny',
    },
  };
}

// team_players.acquisition_type values
const ACQUISITION_LABEL: Record<string, string> = {
  REGISTERED: 'Registered',
  ICON_LOT: 'Icon lot',
  SETTER_LOT: 'Setter lot',
  AUCTION: 'Auction',
  MANUAL: 'Assigned',
  MANUAL_ASSIGNMENT: 'Assigned',
};

const POSITION_COLOR: Record<string, string> = {
  SETTER: 'bg-warning/10 text-warning',
  LIBERO: 'bg-success/10 text-success',
  MIDDLE_BLOCKER: 'bg-primary/10 text-primary',
  OUTSIDE_HITTER: 'bg-danger/10 text-danger',
  OPPOSITE: 'bg-info/10 text-info',
  UNIVERSAL: 'bg-surface-muted text-text-secondary',
};

export default async function PublicPlayersPage({ params }: Props) {
  const { slug } = await params;
  const tournament = await getTournamentHeader(slug);
  if (!tournament) return <TournamentNotFound />;

  const supabase = await createClient();

  const { data: players } = await supabase
    .from('public_player_view')
    .select('id,display_name,photo_path,primary_position,secondary_position,team_id,acquisition_type')
    .eq('tournament_id', tournament.id)
    .order('display_name');

  // Fetch team names for player cards
  const teamIds = [...new Set((players ?? []).map((p) => p.team_id).filter(Boolean))];
  const { data: teams } = teamIds.length
    ? await supabase.from('public_team_view').select('id,name,short_name').in('id', teamIds)
    : { data: [] };

  const teamName = (id: string | null) => teams?.find((t) => t.id === id)?.name ?? null;

  return (
    <PublicTournamentFrame slug={slug} name={tournament.name} logoUrl={tournament.logoUrl} status={tournament.status}>
      <div className="mb-8">
        <p className="text-primary text-xs font-bold uppercase tracking-[0.2em]">
          Approved players
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Players</h1>
        {players && players.length > 0 && (
          <p className="text-text-muted mt-1.5 text-sm">
            {players.length} player{players.length === 1 ? '' : 's'}
          </p>
        )}
      </div>

      {(!players || players.length === 0) ? (
        <EmptyState text="Players will appear here once their registrations are approved." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {players.map((player) => {
            const pos = player.primary_position;
            const posLabel = pos ? formatVolleyballPosition(pos) : null;
            const posCfg = pos ? (POSITION_COLOR[pos] ?? POSITION_COLOR.UNIVERSAL) : null;

            // Safe photo resolution
            const photoUrl = player.photo_path
              ? supabase.storage.from('player-photos').getPublicUrl(player.photo_path).data.publicUrl
              : null;

            const team = teamName(player.team_id);
            const acqLabel = player.acquisition_type
              ? (ACQUISITION_LABEL[player.acquisition_type] ?? player.acquisition_type)
              : null;

            return (
              <article
                key={player.id}
                className="flex items-start gap-4 rounded-2xl p-4 border border-border bg-surface shadow-card"
              >
                {/* Photo / Avatar */}
                {photoUrl ? (
                  <div
                    className="border border-border relative h-12 w-12 shrink-0 overflow-hidden rounded-xl"
                  >
                    <Image
                      src={photoUrl}
                      alt={player.display_name ?? 'Player'}
                      fill
                      sizes="48px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-black ${posCfg ?? 'bg-primary/10 text-primary'}`}>
                    {(player.display_name ?? '?').charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-sm">
                    <Link href={`/t/${slug}/players/${player.id}`} className="hover:text-primary hover:underline">{player.display_name}</Link>
                  </p>

                  {posLabel && (
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${posCfg ?? 'bg-primary/10 text-primary'}`}>
                      {posLabel}
                      {player.secondary_position && (
                        <> · {formatVolleyballPosition(player.secondary_position)}</>
                      )}
                    </span>
                  )}

                  <div className="text-text-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {team && <span>{team}</span>}
                    {acqLabel && <span>{acqLabel}</span>}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PublicTournamentFrame>
  );
}