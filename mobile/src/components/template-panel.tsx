import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Field } from '@/components/form';
import { Text } from '@/components/text';
import { Button, ErrorText } from '@/components/ui';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

/** Start a new tournament from this one: settings, default format, price categories and colours (no teams, players or fixtures). */
export function TemplatePanel({ sourceId, sourceName }: { sourceId: string; sourceName: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${sourceName} (next)`);
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true); setError(null);
    const { data, error: e } = await api.rpc('duplicate_tournament', { p_source: sourceId, p_name: name.trim(), p_slug: slugify(slug || name) });
    setBusy(false);
    if (e) return setError(e.message);
    router.push({ pathname: '/organizer/new', params: { id: data as unknown as string } });
  }

  if (!open) return <Button tone="secondary" title="Use as a template" onPress={() => setOpen(true)} />;
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: t.textSecondary, fontSize: 13 }}>Creates a draft with the settings, default format, price categories and colours of this tournament. Teams, players and fixtures are not copied. You can review it before opening registration.</Text>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Field label="New tournament name" value={name} onChangeText={setName} maxLength={120} />
      <Field label="Address (letters, numbers, hyphens)" value={slug || slugify(name)} onChangeText={(v) => setSlug(slugify(v))} autoCapitalize="none" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button tone="secondary" title="Cancel" onPress={() => setOpen(false)} /></View>
        <View style={{ flex: 1 }}><Button title="Create draft" loading={busy} disabled={!name.trim()} onPress={() => void create()} /></View>
      </View>
    </View>
  );
}
