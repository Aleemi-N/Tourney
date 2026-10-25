import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { onColor, radius, tint, useIsDark, useTheme } from '@/theme';

/** Scrollable page with the app background and safe-area padding. */
export function Screen({ children, scroll = true, edges = ['bottom'] }: { children: ReactNode; scroll?: boolean; edges?: ('top' | 'bottom')[] }) {
  const t = useTheme();
  const body = scroll
    ? <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">{children}</ScrollView>
    : <View style={styles.page}>{children}</View>;
  return <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.background }}>{body}</SafeAreaView>;
}

/** The web's card: 16px radius, hairline border and a soft shadow. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const dark = useIsDark();
  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border, shadowColor: t.shadow, shadowOpacity: dark ? 0.3 : 0.06 }, style]}>
      {children}
    </View>
  );
}

/** Page title block like PageHeader: optional eyebrow, bold title, optional description. */
export function Heading({ children, eyebrow, small }: { children: ReactNode; eyebrow?: string; small?: boolean }) {
  const t = useTheme();
  return (
    <View>
      {eyebrow ? <Text style={[styles.eyebrow, { color: t.textMuted }]}>{eyebrow}</Text> : null}
      <Text accessibilityRole="header" style={[small ? styles.headingSmall : styles.heading, { color: t.text }]}>{children}</Text>
    </View>
  );
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[styles.body, { color: muted ? t.textSecondary : t.text }, style]}>{children}</Text>;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';

export function Button({ title, onPress, disabled, loading, tone = 'primary', color, accessibilityLabel, icon }: {
  title: string; onPress: () => void; disabled?: boolean; loading?: boolean; tone?: Variant | 'secondary'; color?: string; accessibilityLabel?: string; icon?: ReactNode;
}) {
  const t = useTheme();
  const v = tone;
  const bg = color ?? (v === 'primary' ? t.primary : v === 'danger' ? t.danger : v === 'secondary' ? t.surface : 'transparent');
  const fg = color ? onColor(color) : v === 'primary' ? t.primaryText : v === 'danger' ? t.textInverse : v === 'danger-outline' ? t.danger : v === 'ghost' ? t.textSecondary : t.text;
  const border = v === 'secondary' ? t.borderStrong : v === 'danger-outline' ? tint(t.danger, 0.4) : 'transparent';
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading} onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <>{icon}<Text style={[styles.buttonText, { color: fg }]}>{title}</Text></>}
    </Pressable>
  );
}

// Same status words and tones as the web StatusPill (docs/design.md §16).
const STATUSES: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' }, REGISTRATION: { label: 'Registration open', tone: 'success' }, PREPARATION: { label: 'Preparation', tone: 'info' },
  LIVE: { label: 'Live', tone: 'live' }, COMPLETED: { label: 'Completed', tone: 'neutral' }, ARCHIVED: { label: 'Archived', tone: 'neutral' },
  PENDING: { label: 'Pending', tone: 'warning' }, APPROVED: { label: 'Approved', tone: 'success' }, CHANGES_REQUESTED: { label: 'Changes requested', tone: 'warning' },
  REJECTED: { label: 'Rejected', tone: 'danger' }, WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' }, SCHEDULED: { label: 'Scheduled', tone: 'info' },
  POSTPONED: { label: 'Postponed', tone: 'warning' }, CANCELLED: { label: 'Cancelled', tone: 'neutral' }, ACTIVE: { label: 'Active', tone: 'success' }, SUSPENDED: { label: 'Suspended', tone: 'danger' },
};
type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'live';

/** A status chip: tinted pill with a dot and a text label, so state never relies on colour alone. */
export function StatusPill({ status, label, tone }: { status?: string; label?: string; tone?: Tone }) {
  const t = useTheme();
  const known = status ? STATUSES[status] : undefined;
  const resolved: Tone = tone ?? known?.tone ?? 'neutral';
  const color = { neutral: t.textSecondary, primary: t.primary, success: t.success, warning: t.warning, danger: t.danger, info: t.info, live: t.live }[resolved];
  const bg = resolved === 'neutral' ? t.surfaceMuted : tint(color, 0.1);
  const text = label ?? known?.label ?? (status ? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ') : '');
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} accessible accessibilityLabel={text}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

/** Generic label chip (kept for call sites that are not a status). */
export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'live' | 'success' }) {
  return <StatusPill label={label} tone={tone} />;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text accessibilityRole="alert" style={[styles.body, { color: t.danger, backgroundColor: tint(t.danger, 0.1), borderRadius: radius.xl, padding: 12 }]}>{children}</Text>;
}

export function Loading() {
  const t = useTheme();
  return <ActivityIndicator style={{ marginTop: 48 }} color={t.primary} />;
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderRadius: radius['2xl'], padding: 16, gap: 6, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 1 },
  eyebrow: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 },
  heading: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  headingSmall: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  button: { minHeight: 44, borderRadius: radius.xl, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  buttonText: { fontSize: 15, fontWeight: '600' },
  pill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
