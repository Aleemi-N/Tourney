import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { OwnerPage, type OwnerTeam } from '@/components/owner';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty, positionLabel, positionTone } from '@/components/tournament';
import { Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { radius, tint, useTheme } from '@/theme';

type Row = { id: string; acquisition_type: string; acquisition_amount: number | null; player_profiles: { display_name: string; primary_position: string | null; secondary_position: string | null; jersey_number: string | null } | null };
const ACQUISITION: Record<string, string> = { AUCTION: 'Main auction', ICON_LOT: 'Icon lot', SETTER_LOT: 'Setter lot', MANUAL: 'Manual assignment', MANUAL_ASSIGNMENT: 'Manual assignment' };

/** The squad: who has joined and how. */
export default function OwnerSquad() {
  return <OwnerPage tab="squad" title="My squad">{(team) => <Squad team={team} />}</OwnerPage>;
}

function Squad({ team }: { team: OwnerTeam }) {
  const t = useTheme();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [limits, setLimits] = useState<{ min: number; max: number | null }>({ min: 0, max: null });
  useEffect(() => {
    api.from('team_players').select('id,acquisition_type,acquisition_amount,player_profiles(display_name,primary_position,secondary_position,jersey_number)').eq('team_id', team.id).eq('status', 'ACTIVE').order('joined_at').then(({ data }) => setRows((data as unknown as Row[]) ?? []));
    api.from('tournament_settings').select('min_squad_size,max_squad_size').eq('tournament_id', team.tournament_id).maybeSingle().then(({ data }) => setLimits({ min: (data?.min_squad_size as number | undefined) ?? 0, max: (data?.max_squad_size as number | null | undefined) ?? null }));
  }, [team]);
  if (!rows) return <Loading />;
  const below = rows.length < limits.min;
  return (
    <>
      <View style={[portalCard(t), { gap: 4 }]}>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>{rows.length}{limits.max ? ` / ${limits.max}` : ''} players</Text>
        <Text style={{ color: below ? t.danger : t.success, fontSize: 14, fontWeight: '600' }}>{below ? `Below the minimum squad of ${limits.min}` : limits.max && rows.length >= limits.max ? 'Maximum squad reached' : 'Valid squad'}</Text>
      </View>
      {rows.length === 0 ? <Empty text="No players have joined your squad yet." /> : rows.map((r) => {
        const p = r.player_profiles;
        const tone = positionTone(p?.primary_position ?? null, t);
        return (
          <View key={r.id} style={[portalCard(t), { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
            <View style={{ width: 48, height: 48, borderRadius: radius.xl, backgroundColor: tint(tone, 0.12), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: tone, fontSize: 17, fontWeight: '800' }}>{p?.jersey_number ?? (p?.display_name ?? '?').slice(0, 2).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>{p?.display_name}</Text>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>{[p?.primary_position ? positionLabel(p.primary_position) : null, p?.secondary_position ? positionLabel(p.secondary_position) : null].filter(Boolean).join(' / ')}</Text>
              <Text style={{ color: t.textSecondary, fontSize: 12 }}>{ACQUISITION[r.acquisition_type] ?? r.acquisition_type}{r.acquisition_amount ? ` · ₹${Number(r.acquisition_amount).toLocaleString('en-IN')}` : ''}</Text>
            </View>
          </View>
        );
      })}
    </>
  );
}
