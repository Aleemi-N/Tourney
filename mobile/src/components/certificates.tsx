import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { portalCard } from '@/components/shell';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { shareView, type ViewHandle } from '@/lib/share';
import { useTheme } from '@/theme';

export type Certificate = { cert_key: string; kind: string; title: string; recipient: string; team_name: string | null; detail: string | null; awarded_on: string | null; tournament_name: string };
export const KIND_LABEL: Record<string, string> = { CHAMPION: 'Champions', RUNNER_UP: 'Runners-up', AWARD: 'Awards', MVP: 'Player of the match', PARTICIPANT: 'Participation' };

const GOLD = '#b08d3c', INK = '#1b1d2a', MUTED = '#5c6075';
const day = (d: string | null) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

/** One certificate drawn as a card, with a button that shares it as a picture (WhatsApp and the rest). Always light, like paper. */
export function CertificateCard({ cert }: { cert: Certificate }) {
  const card = useRef<ViewHandle>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <View ref={card} collapsable={false} accessibilityLabel={`${cert.title} certificate for ${cert.recipient}`} style={{ backgroundColor: '#ffffff', borderWidth: 6, borderColor: GOLD, borderRadius: 4, padding: 22, alignItems: 'center', gap: 12 }}>
        <Text style={{ color: GOLD, fontSize: 12, fontWeight: '800', letterSpacing: 3, textTransform: 'uppercase', textAlign: 'center' }}>{cert.tournament_name}</Text>
        <Text style={{ color: INK, fontSize: 28, fontWeight: '800', textAlign: 'center' }}>{cert.title}</Text>
        <Text style={{ color: MUTED, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'center' }}>Proudly presented to</Text>
        <Text style={{ color: GOLD, fontSize: 30, fontWeight: '800', fontStyle: 'italic', textAlign: 'center' }}>{cert.recipient}</Text>
        {cert.team_name ? <Text style={{ color: INK, fontSize: 15, fontWeight: '700', textAlign: 'center' }}>{cert.team_name}</Text> : null}
        {cert.detail ? <Text style={{ color: INK, fontSize: 14, textAlign: 'center' }}>{cert.detail}</Text> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 10, gap: 16 }}>
          <Text style={{ flex: 1, color: MUTED, fontSize: 11, borderTopWidth: 1, borderTopColor: '#8a8ea3', paddingTop: 3 }}>{day(cert.awarded_on) || 'Date'}</Text>
          <Text style={{ flex: 1, color: MUTED, fontSize: 11, borderTopWidth: 1, borderTopColor: '#8a8ea3', paddingTop: 3, textAlign: 'right' }}>Tournament organizer</Text>
        </View>
      </View>
      {error ? <Text style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
      <Button tone="secondary" title="Share certificate" accessibilityLabel={`Share the ${cert.title} certificate`} onPress={() => void shareView(card.current, `certificate-${cert.recipient.replace(/\W+/g, '-')}.png`, 'Certificate').catch((e) => setError(e instanceof Error ? e.message : 'Could not share.'))} />
    </View>
  );
}

/** The signed-in player's certificates from finished tournaments. Renders nothing when there are none. */
export function MyCertificates() {
  const t = useTheme();
  const { session } = useAuth();
  const [items, setItems] = useState<Certificate[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (!session) return;
    api.rpc('my_certificates').then(({ data }) => setItems((data ?? []) as unknown as Certificate[]));
  }, [session]);
  if (!items || items.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>My certificates</Text>
      {items.map((c) => {
        const id = `${c.tournament_name}|${c.cert_key}`;
        return (
          <View key={id} style={[portalCard(t), { gap: 10 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{c.title}</Text>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>{c.tournament_name}{c.team_name ? ` · ${c.team_name}` : ''}</Text>
              </View>
              <Button tone="secondary" title={open === id ? 'Hide' : 'View'} accessibilityLabel={`${open === id ? 'Hide' : 'View'} the ${c.title} certificate for ${c.tournament_name}`} onPress={() => setOpen(open === id ? null : id)} />
            </View>
            {open === id ? <CertificateCard cert={c} /> : null}
          </View>
        );
      })}
    </View>
  );
}
