import { router } from 'expo-router';
import { Eye, EyeOff, Volleyball } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/text';
import { radius, useTheme } from '@/theme';

/** The web's auth layout: logo and "Back to Home" above a rounded card. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 24, gap: 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Volleyball size={26} color={t.primary} />
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '700' }}>Tourny</Text>
          </View>
          <Pressable accessibilityRole="link" onPress={() => (router.canGoBack() ? router.dismissAll() : router.replace('/'))} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text style={{ color: t.textSecondary, fontSize: 14, fontWeight: '500' }}>Back to Home</Text>
          </Pressable>
        </View>
        <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius['3xl'], padding: 24, gap: 18 }}>
          <View style={{ gap: 6 }}>
            <Text accessibilityRole="header" style={{ color: t.text, fontSize: 32, fontWeight: '800', letterSpacing: -0.8 }}>{title}</Text>
            <Text style={{ color: t.textSecondary, fontSize: 14 }}>{subtitle}</Text>
          </View>
          {children}
          <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: 16, alignItems: 'center' }}>{footer}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Uppercase label above a rounded input, like the web's auth fields. */
export function AuthField({ label, secure, right, ...props }: { label: string; secure?: boolean; right?: ReactNode } & TextInputProps) {
  const t = useTheme();
  const [hidden, setHidden] = useState(!!secure);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: t.textMuted, fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</Text>
        {right}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.background, borderWidth: 1, borderColor: t.border, borderRadius: radius['2xl'], minHeight: 52, paddingHorizontal: 16 }}>
        <TextInput accessibilityLabel={label} placeholderTextColor={t.textMuted} secureTextEntry={hidden} {...props}
          style={{ flex: 1, color: t.text, fontSize: 16, fontFamily: 'Geist_400Regular', paddingVertical: 12 }} />
        {secure ? (
          <Pressable accessibilityRole="button" accessibilityLabel={hidden ? 'Show password' : 'Hide password'} onPress={() => setHidden(!hidden)} hitSlop={10}>
            {hidden ? <Eye size={20} color={t.textMuted} /> : <EyeOff size={20} color={t.textMuted} />}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
