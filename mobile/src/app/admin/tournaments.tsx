import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { AdminFrame, adminDate, openTournament } from '@/components/admin';
import { Choice, Field } from '@/components/form';
import { portalCard } from '@/components/shell';
import { Text } from '@/components/text';
import { Empty } from '@/components/tournament';
import { ErrorText, Loading, StatusPill } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

type Row = { id: string; name: string; slug: string; format: string | null; status: string; is_public: boolean; created_at: string; approval_status: string; profiles: { full_name: string | null; email: string | null } | null; organizations: { name: string } | null };
const FILTERS = [{ value: 'ALL', label: 'All' }, { value: 'PENDING_APPROVAL', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' }, { value: 'REJECTED', label: 'Rejected' }];

/** Every tournament on the platform, with a filter and search. */
export default function AdminTournaments() {
  const t = useTheme();
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(async () => {
      let q = api.from('tournaments').select('id,name,slug,format,status,is_public,created_at,approval_status,profiles!created_by(full_name,email),organizations(name)').order('created_at', { ascending: false });
      if (filter !== 'ALL') q = q.eq('approval_status', filter);
      if (search.trim()) q = q.ilike('name', `%${search.trim().replace(/[%,]/g, '')}%`);
      const { data, error: e } = await q;
      if (e) return setError('Failed to load tournaments.');
      setError(null);
      setRows(data as unknown as Row[]);
    }, 250);
    return () => clearTimeout(timer);
  }, [filter, search]);

  return (
    <AdminFrame current="tournaments" title="Tournaments" subtitle="All tournaments on the platform">
      <Field label="Search by name" value={search} onChangeText={setSearch} autoCapitalize="none" />
      <Choice label="Approval" value={filter} options={FILTERS} onChange={setFilter} />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {!rows ? (error ? null : <Loading />) : rows.length === 0 ? <Empty text="No tournaments match." /> : rows.map((r) => (
        <Pressable key={r.id} accessibilityRole="link" accessibilityLabel={r.name} onPress={() => openTournament(r.id)} style={[portalCard(t), { gap: 8 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <Text style={{ flex: 1, color: t.text, fontSize: 17, fontWeight: '700' }}>{r.name}</Text>
            <StatusPill status={r.approval_status} />
          </View>
          <Text style={{ color: t.textSecondary, fontSize: 13 }}>/{r.slug} · {r.status}{r.is_public ? ' · public' : ''}</Text>
          <Text style={{ color: t.textMuted, fontSize: 12 }}>{[r.organizations?.name, r.profiles?.full_name, adminDate(r.created_at)].filter(Boolean).join(' · ')}</Text>
        </Pressable>
      ))}
    </AdminFrame>
  );
}
