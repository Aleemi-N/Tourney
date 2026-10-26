import { CalendarPlus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { FollowButton } from '@/components/follow-button';
import { QrCard } from '@/components/qr';
import { PosterShare, ResultPoster, useLogoUrl } from '@/components/poster';
import { Button, ErrorText } from '@/components/ui';
import { api, siteUrl } from '@/lib/api';
import { addToCalendar } from '@/lib/calendar';
import type { MatchState } from '@/lib/live';
import { useTheme } from '@/theme';

/** Share the result as a poster, share the match QR, and add an upcoming match to the calendar. */
export function MatchShare({ state, slug, tournament }: { state: MatchState; slug: string; tournament: { id: string; name: string; venue: string | null } }) {
  const t = useTheme();
  const logo = useLogoUrl(tournament.id);
  const [when, setWhen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { home_team: home, away_team: away, sets, match } = state;

  useEffect(() => {
    api.from('public_fixture_view').select('scheduled_at').eq('id', match.id).maybeSingle().then(({ data }) => setWhen((data?.scheduled_at as string | null | undefined) ?? null));
  }, [match.id]);

  const won = (teamId: string) => sets.filter((s) => s.winner_team_id === teamId).length;
  const winner = match.winner_team_id === home.id ? home.name : match.winner_team_id === away.id ? away.name : null;
  const played = sets.filter((s) => s.status !== 'PENDING' || s.home_score + s.away_score > 0).map((s) => ({ n: s.set_number, h: s.home_score, a: s.away_score }));
  const completed = match.status === 'COMPLETED';

  return (
    <View style={{ gap: 14 }}>
      {!completed ? <FollowButton kind="MATCH" targetId={match.id} name="this match" /> : null}
      <PosterShare label={completed ? 'Share result poster' : 'Share score poster'} fileName={`match-${match.match_number ?? match.id}.png`} shareTitle={`${home.name} vs ${away.name}`}>
        <ResultPoster tournament={tournament} logoUrl={logo} home={home.name} away={away.name} homeSets={won(home.id)} awaySets={won(away.id)} sets={played} status={completed ? 'FINAL' : match.status} winner={winner} />
      </PosterShare>
      {!completed && when ? (
        <>
          <Button tone="secondary" title="Add to calendar" icon={<CalendarPlus size={16} color={t.text} />} onPress={() => { setError(null); addToCalendar({ title: `${home.name} vs ${away.name}`, start: new Date(when), location: [match.venue, match.court ? `Court ${match.court}` : null].filter(Boolean).join(', ') || tournament.venue, notes: `${tournament.name} · ${siteUrl}/t/${slug}/match/${match.id}` }).catch((e) => setError(e instanceof Error ? e.message : 'Could not open the calendar.')); }} />
          {error ? <ErrorText>{error}</ErrorText> : null}
        </>
      ) : null}
      <QrCard title={`${home.name} vs ${away.name}`} subtitle="Scan for the live score" value={`${siteUrl}/t/${slug}/match/${match.id}`} fileName={`match-qr-${match.match_number ?? match.id}.png`} />
    </View>
  );
}
