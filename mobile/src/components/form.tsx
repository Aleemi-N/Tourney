import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme';

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.textSecondary, fontSize: 14 }}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={t.textMuted}
        style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface, color: t.text, paddingHorizontal: 14, fontSize: 16 }} {...props} />
    </View>
  );
}

/** One choice out of a few, as large tappable chips. */
export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T | ''; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={{ color: t.textSecondary, fontSize: 14 }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={o.label} onPress={() => onChange(o.value)}
              style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center', backgroundColor: selected ? t.primary : t.surfaceMuted }}>
              <Text style={{ color: selected ? t.primaryText : t.text, fontWeight: '600' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
