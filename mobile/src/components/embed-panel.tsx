import { useState } from 'react';
import { Share, View } from 'react-native';
import { Text } from '@/components/text';
import { Button } from '@/components/ui';
import { siteUrl } from '@/lib/api';
import { radius, useTheme } from '@/theme';

/** Ready-made <iframe> code for a table, fixtures list or live score that a club can paste into its own website. */
export function EmbedPanel({ slug, firstMatchId }: { slug: string; firstMatchId?: string | null }) {
  const t = useTheme();
  const [theme, setTheme] = useState<'' | '?theme=dark'>('');
  const snippets = [
    { key: 'table', label: 'League table', url: `${siteUrl}/embed/t/${slug}/table${theme}`, height: 420 },
    { key: 'fixtures', label: 'Fixtures and results', url: `${siteUrl}/embed/t/${slug}/fixtures${theme}`, height: 520 },
    ...(firstMatchId ? [{ key: 'live', label: 'Live score of a match', url: `${siteUrl}/embed/t/${slug}/live/${firstMatchId}${theme}`, height: 260 }] : []),
  ];
  const code = (s: { url: string; height: number }) => `<iframe src="${s.url}" width="100%" height="${s.height}" style="border:0;max-width:640px" loading="lazy" title="Tourny"></iframe>`;
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: t.textSecondary, fontSize: 13 }}>Paste one of these into your club website. The widget updates by itself and links back to Tourny.</Text>
      <Button tone="secondary" title={theme ? 'Use the light theme' : 'Use the dark theme'} onPress={() => setTheme(theme ? '' : '?theme=dark')} />
      {snippets.map((s) => (
        <View key={s.key} style={{ gap: 8 }}>
          <Text style={{ color: t.text, fontSize: 14, fontWeight: '700' }}>{s.label}</Text>
          <Text selectable accessibilityLabel={`Embed code for ${s.label}`} style={{ color: t.textSecondary, fontSize: 11, padding: 10, borderRadius: radius.xl, backgroundColor: t.surfaceMuted }}>{code(s)}</Text>
          <Button tone="secondary" title="Share code" accessibilityLabel={`Share code for ${s.label}`} onPress={() => void Share.share({ message: code(s) }).catch(() => {})} />
        </View>
      ))}
    </View>
  );
}
