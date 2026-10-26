import { Share2 } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, View } from 'react-native';
import { Text } from '@/components/text';
import { Button, ErrorText } from '@/components/ui';
import { api, imageUrl } from '@/lib/api';
import { shareView, type ViewHandle } from '@/lib/share';
import { useTheme } from '@/theme';

// Posters are always dark indigo (like the web's share posters) so they look the same wherever they are posted.
const INK = '#0b1020';
const PANEL = '#131a2e';
const LINE = '#253049';
const TEXT = '#f1f5f9';
const MUTED = '#8f9bb3';
const ACCENT = '#8b93f8';
const WIDTH = 360;

export type PosterTournament = { id: string; name: string; venue?: string | null };

/** The tournament logo path (public), or null. */
export function useLogoUrl(tournamentId: string | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!tournamentId) return;
    api.from('tournament_branding').select('logo_path').eq('tournament_id', tournamentId).maybeSingle().then(({ data }) => setUrl(imageUrl('logos', (data?.logo_path as string | null | undefined) ?? null)));
  }, [tournamentId]);
  return url;
}

/** The poster canvas: logo and name on top, rows in the middle, venue and the Tourny mark at the bottom. */
export function PosterFrame({ tournament, logoUrl, title, pill, children }: { tournament: PosterTournament; logoUrl: string | null; title: string; pill?: string; children: ReactNode }) {
  return (
    <View style={{ width: WIDTH, backgroundColor: INK, padding: 20, gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {logoUrl ? <Image accessibilityLabel="Tournament logo" source={{ uri: logoUrl }} style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: PANEL }} resizeMode="contain" /> : (
          <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: PANEL, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: ACCENT, fontSize: 20, fontWeight: '800' }}>{tournament.name.slice(0, 1).toUpperCase()}</Text></View>
        )}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ color: TEXT, fontSize: 18, fontWeight: '800' }}>{tournament.name}</Text>
          <Text style={{ color: MUTED, fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' }}>{title}</Text>
        </View>
        {pill ? <View style={{ backgroundColor: '#1a2238', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ color: ACCENT, fontSize: 11, fontWeight: '800' }}>{pill}</Text></View> : null}
      </View>
      <View style={{ height: 1, backgroundColor: LINE }} />
      {children}
      <View style={{ height: 1, backgroundColor: LINE }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text numberOfLines={1} style={{ flex: 1, color: MUTED, fontSize: 11 }}>{tournament.venue ?? ''}</Text>
        <Text style={{ color: ACCENT, fontSize: 12, fontWeight: '800' }}>Tourny</Text>
      </View>
    </View>
  );
}

/** A button that shows the poster and shares it as an image. */
export function PosterShare({ label, fileName, shareTitle, children }: { label: string; fileName: string; shareTitle: string; children: ReactNode }) {
  const t = useTheme();
  const ref = useRef<ViewHandle>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setBusy(true); setError(null);
    try { await shareView(ref.current, fileName, shareTitle); } catch (e) { setError(e instanceof Error ? e.message : 'Could not share.'); }
    setBusy(false);
  }

  return (
    <View style={{ gap: 12 }}>
      <Button tone="secondary" title={open ? 'Hide poster' : label} icon={<Share2 size={16} color={t.text} />} onPress={() => setOpen(!open)} />
      {open ? (
        <View style={{ gap: 10, alignItems: 'center' }}>
          <View ref={ref} collapsable={false} accessibilityLabel="Poster preview" style={{ borderRadius: 16, overflow: 'hidden' }}>{children}</View>
          {error ? <ErrorText>{error}</ErrorText> : null}
          <View style={{ alignSelf: 'stretch' }}><Button title="Share image" accessibilityLabel={`Share ${fileName}`} loading={busy} onPress={() => void share()} /></View>
        </View>
      ) : null}
    </View>
  );
}



type StandingRow = { team_id: string; team_name: string; played: number; won: number; lost: number; league_points: number };

/** The league table as a poster. */
export function StandingsPoster({ tournament, logoUrl, stageName, qualify, rows }: { tournament: PosterTournament; logoUrl: string | null; stageName: string; qualify?: number | null; rows: StandingRow[] }) {
  const q = qualify ?? 0;
  return (
    <PosterFrame tournament={tournament} logoUrl={logoUrl} title="Standings" pill={stageName}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', paddingHorizontal: 10 }}>
          <Text style={{ width: 26, color: MUTED, fontSize: 10, fontWeight: '800' }}>#</Text>
          <Text style={{ flex: 1, color: MUTED, fontSize: 10, fontWeight: '800' }}>TEAM</Text>
          {['P', 'W', 'L'].map((h) => <Text key={h} style={{ width: 28, textAlign: 'center', color: MUTED, fontSize: 10, fontWeight: '800' }}>{h}</Text>)}
          <Text style={{ width: 36, textAlign: 'right', color: MUTED, fontSize: 10, fontWeight: '800' }}>PTS</Text>
        </View>
        {rows.slice(0, 10).map((r, i) => (
          <View key={r.team_id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, height: 36, borderRadius: 10, backgroundColor: i < q ? '#1d2552' : PANEL }}>
            <Text style={{ width: 26, color: i < q ? ACCENT : MUTED, fontSize: 13, fontWeight: '800' }}>{i + 1}</Text>
            <Text numberOfLines={1} style={{ flex: 1, color: TEXT, fontSize: 13, fontWeight: '700' }}>{r.team_name}</Text>
            {[r.played, r.won, r.lost].map((v, k) => <Text key={k} style={{ width: 28, textAlign: 'center', color: '#b4bfd2', fontSize: 12 }}>{v}</Text>)}
            <Text style={{ width: 36, textAlign: 'right', color: ACCENT, fontSize: 14, fontWeight: '800' }}>{r.league_points}</Text>
          </View>
        ))}
      </View>
      {q > 0 ? <Text style={{ color: MUTED, fontSize: 10 }}>Shaded teams qualify for the next stage.</Text> : null}
    </PosterFrame>
  );
}

export type PosterMatch = { id: string; label: string; home: string; away: string; when: string | null; court?: string | null };

/** Upcoming fixtures as a poster. */
export function FixturesPoster({ tournament, logoUrl, pill, matches }: { tournament: PosterTournament; logoUrl: string | null; pill?: string; matches: PosterMatch[] }) {
  return (
    <PosterFrame tournament={tournament} logoUrl={logoUrl} title="Fixtures" pill={pill}>
      <View style={{ gap: 8 }}>
        {matches.slice(0, 8).map((m) => (
          <View key={m.id} style={{ backgroundColor: PANEL, borderRadius: 12, padding: 12, gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: ACCENT, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>{m.label}</Text>
              <Text style={{ color: MUTED, fontSize: 11 }}>{[m.when, m.court ? `Court ${m.court}` : null].filter(Boolean).join(' · ') || 'Time to be announced'}</Text>
            </View>
            <Text numberOfLines={1} style={{ color: TEXT, fontSize: 14, fontWeight: '800' }}>{m.home} <Text style={{ color: MUTED, fontWeight: '500' }}>vs</Text> {m.away}</Text>
          </View>
        ))}
        {matches.length > 8 ? <Text style={{ color: MUTED, fontSize: 11, textAlign: 'center' }}>+ {matches.length - 8} more fixtures</Text> : null}
      </View>
    </PosterFrame>
  );
}

/** A match result (or live score) as a card to post after the game. */
export function ResultPoster({ tournament, logoUrl, home, away, homeSets, awaySets, sets, status, winner }: { tournament: PosterTournament; logoUrl: string | null; home: string; away: string; homeSets: number; awaySets: number; sets: { n: number; h: number; a: number }[]; status: string; winner: string | null }) {
  return (
    <PosterFrame tournament={tournament} logoUrl={logoUrl} title="Match result" pill={status}>
      <View style={{ gap: 14, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' }}>
          <Text numberOfLines={2} style={{ flex: 1, color: TEXT, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>{home}</Text>
          <Text style={{ color: ACCENT, fontSize: 44, fontWeight: '900' }}>{homeSets} – {awaySets}</Text>
          <Text numberOfLines={2} style={{ flex: 1, color: TEXT, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>{away}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          {sets.map((s) => (
            <View key={s.n} style={{ backgroundColor: PANEL, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' }}>
              <Text style={{ color: MUTED, fontSize: 9, fontWeight: '800' }}>SET {s.n}</Text>
              <Text style={{ color: TEXT, fontSize: 15, fontWeight: '800' }}>{s.h} – {s.a}</Text>
            </View>
          ))}
        </View>
        {winner ? <Text style={{ color: '#4ade80', fontSize: 15, fontWeight: '800' }}>{winner} win{winner.endsWith('s') ? '' : 's'}</Text> : null}
      </View>
    </PosterFrame>
  );
}
