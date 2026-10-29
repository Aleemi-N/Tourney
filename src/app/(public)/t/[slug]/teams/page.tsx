import type { Metadata } from 'next';
import { createClient } from '@/lib/api/server';
import { getTournamentHeader } from '@/lib/tournament-header';
import { PublicTournamentFrame } from '@/components/public/PublicTournamentFrame';
import { TournamentNotFound, EmptyState } from '@/components/public/TournamentNotFound';
import { buildTournamentMetadata, TOURNY_PRODUCTION_ORIGIN } from '@/lib/public-tournament-metadata';
import Image from 'next/image';
import Link from 'next/link';
import { MapPin } from 'lucide-react';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = await buildTournamentMetadata(slug, 'teams');
  const title = (meta.title as { absolute: string })?.absolute ?? 'Teams';
  const description = meta.description ?? 'All teams competing.';
  const canonical = new URL(`/t/${slug}/teams`, TOURNY_PRODUCTION_ORIGIN);
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

export default async function PublicTeamsPage({ params }: Props) {
  const { slug } = await params;
  const tournament = await getTournamentHeader(slug);
  if (!tournament) return <TournamentNotFound />;

  const api = await createClient();
  const { data: teams } = await api
    .from('public_team_view')
    .select('id,name,short_name,place,logo_path,primary_color,secondary_color')
    .eq('tournament_id', tournament.id)
    .order('name');

  return (
    <PublicTournamentFrame slug={slug} name={tournament.name} logoUrl={tournament.logoUrl} status={tournament.status}>
      <div className="mb-8">
        <p className="text-primary text-xs font-bold uppercase tracking-[0.2em]">
          Tournament teams
        </p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Teams</h1>
        {teams && teams.length > 0 && (
          <p className="text-text-muted mt-1.5 text-sm">
            {teams.length} team{teams.length === 1 ? '' : 's'} registered
          </p>
        )}
      </div>

      {(!teams || teams.length === 0) ? (
        <EmptyState text="Teams will appear here once registrations are approved." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => {
            const initials = (team.short_name ?? team.name ?? 'TM').slice(0, 3).toUpperCase();
            const accent = team.primary_color ?? '#6366f1';

            // Resolve logo URL if available
            const logoUrl = team.logo_path
              ? api.storage.from('logos').getPublicUrl(team.logo_path).data.publicUrl
              : null;

            return (
              <article
                key={team.id}
                className="group rounded-2xl p-5 transition-colors border border-border bg-surface shadow-card"
              >
                {/* Team badge */}
                {logoUrl ? (
                  <div
                    className="border border-border bg-surface relative mb-4 h-14 w-14 overflow-hidden rounded-2xl"
                  >
                    <Image
                      src={logoUrl}
                      alt={`${team.name} logo`}
                      fill
                      sizes="56px"
                      className="object-contain p-2"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div
                    className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl text-base font-black"
                    style={{
                      background: `${accent}22`,
                      color: accent,
                      border: `1px solid ${accent}44`,
                    }}
                  >
                    {initials}
                  </div>
                )}

                <h2 className="text-lg font-black leading-tight">
                  <Link href={`/t/${slug}/teams/${team.id}`} className="hover:text-primary hover:underline">{team.name}</Link>
                </h2>
                {team.short_name && team.short_name !== team.name && (
                  <p className="text-text-muted mt-0.5 text-xs font-bold uppercase tracking-widest">
                    {team.short_name}
                  </p>
                )}
                {team.place && (
                  <div className="text-text-muted mt-3 flex items-center gap-1.5 text-xs">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span>{team.place}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </PublicTournamentFrame>
  );
}