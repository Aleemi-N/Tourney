import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from '@/components/text';
import { radius, useTheme } from '@/theme';

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '500' }}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={t.textMuted}
        style={{ minHeight: 44, borderRadius: radius.xl, borderWidth: 1, borderColor: t.borderStrong, backgroundColor: t.surface, color: t.text, paddingHorizontal: 14, fontSize: 16, fontFamily: 'Geist_400Regular' }} {...props} />
    </View>
  );
}

/** One choice out of a few, as large tappable chips. */
export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T | ''; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '500' }}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={o.label} onPress={() => onChange(o.value)}
              style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: radius.xl, justifyContent: 'center', borderWidth: 1, borderColor: selected ? t.primary : t.border, backgroundColor: selected ? t.primary : t.surface }}>
              <Text style={{ color: selected ? t.primaryText : t.text, fontWeight: '600', fontSize: 14 }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
