import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { onColor, useTheme } from '@/theme';

/** Scrollable page with the app background and safe-area padding. */
export function Screen({ children, scroll = true, edges = ['bottom'] }: { children: ReactNode; scroll?: boolean; edges?: ('top' | 'bottom')[] }) {
  const t = useTheme();
  const body = scroll
    ? <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={styles.page}>{children}</View>;
  return <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.background }}>{body}</SafeAreaView>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>{children}</View>;
}

export function Heading({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text accessibilityRole="header" style={[styles.heading, { color: t.text }]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[styles.body, { color: muted ? t.textSecondary : t.text }, style]}>{children}</Text>;
}

export function Button({ title, onPress, disabled, loading, tone = 'primary', color, accessibilityLabel }: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean; tone?: 'primary' | 'secondary' | 'danger'; color?: string; accessibilityLabel?: string;
}) {
  const t = useTheme();
  const bg = color ?? (tone === 'primary' ? t.primary : tone === 'danger' ? t.danger : t.surfaceMuted);
  const fg = color ? onColor(color) : tone === 'secondary' ? t.text : tone === 'danger' ? '#ffffff' : t.primaryText;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'live' | 'success' }) {
  const t = useTheme();
  const color = tone === 'live' ? t.danger : tone === 'success' ? t.success : t.textSecondary;
  return <Text style={[styles.pill, { color, borderColor: color }]}>{label}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text accessibilityRole="alert" style={[styles.body, { color: t.danger }]}>{children}</Text>;
}

export function Loading() {
  const t = useTheme();
  return <ActivityIndicator style={{ marginTop: 48 }} color={t.primary} />;
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 6 },
  heading: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  button: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonText: { fontSize: 16, fontWeight: '600' },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
});
