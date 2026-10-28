import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { CertificateCard, KIND_LABEL, type Certificate } from '@/components/certificates';
import { OrganizerFrame, useTournamentName } from '@/components/organizer';
import { Section, portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { Button, ErrorText, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/** Certificates of the tournament, by group. Open one to share it as a picture; printing a whole group is on the website. */
export default function OrganizerCertificates() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const name = useTournamentName(id);
  const [certs, setCerts] = useState<Certificate[] | null>(null);
  const [status, setStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [shownGroup, setShownGroup] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.rpc('get_certificates', { p_tournament_id: id }), api.from('tournaments').select('status').eq('id', id).maybeSingle()]).then(([c, tt]) => {
      if (c.error) return setError(c.error.message);
      setCerts((c.data ?? []) as unknown as Certificate[]);
      setStatus((tt.data?.status as string | undefined) ?? '');
    });
  }, [id]);

  const groups = Object.keys(KIND_LABEL).map((kind) => ({ kind, items: (certs ?? []).filter((c) => c.kind === kind) })).filter((g) => g.items.length > 0);
  const done = status === 'COMPLETED' || status === 'ARCHIVED';
  return (
    <OrganizerFrame id={id} current="certificates" title="Certificates" subtitle={name}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!certs ? (error ? null : <Loading />) : (
        <>
          <Text style={{ color: t.textSecondary, fontSize: 14 }}>Made from the tournament's own records: champions and runners-up, awards, players of the match, and everyone who took part. They become public when the tournament is completed. Share one as a picture here; to print a whole group at once, use the website.</Text>
          {!done ? <Text accessibilityRole="alert" style={{ color: t.warning, fontSize: 14, fontWeight: '700' }}>This tournament is not completed yet, so this is a preview. Champions and runners-up appear once it is completed.</Text> : null}
          {groups.length === 0 ? <Empty text="Nothing to show yet. Approve players, give awards and score matches first." /> : groups.map((g) => (
            <Section key={g.kind} title={`${KIND_LABEL[g.kind]} (${g.items.length})`}>
              {(shownGroup === g.kind || g.items.length <= 6 ? g.items : g.items.slice(0, 6)).map((c) => (
                <View key={c.cert_key} style={[portalCard(t), { gap: 10 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{c.recipient}</Text>
                      <Text style={{ color: t.textMuted, fontSize: 13 }}>{[c.team_name, g.kind === 'AWARD' || g.kind === 'MVP' ? c.title : null].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <Button tone="secondary" title={open === c.cert_key ? 'Hide' : 'View'} accessibilityLabel={`${open === c.cert_key ? 'Hide' : 'View'} the certificate for ${c.recipient}`} onPress={() => setOpen(open === c.cert_key ? null : c.cert_key)} />
                  </View>
                  {open === c.cert_key ? <CertificateCard cert={c} /> : null}
                </View>
              ))}
              {g.items.length > 6 && shownGroup !== g.kind ? <Button tone="secondary" title={`Show all ${g.items.length}`} onPress={() => setShownGroup(g.kind)} /> : null}
            </Section>
          ))}
        </>
      )}
    </OrganizerFrame>
  );
}
