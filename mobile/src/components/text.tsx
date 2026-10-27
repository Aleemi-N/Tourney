import { StyleSheet, Text as RNText, type TextProps } from 'react-native';
import { translate, useLanguage } from '@/lib/i18n';

// React Native picks a font file per weight, so a weight maps to its Geist family.
const FAMILIES: Record<string, string> = {
  '400': 'Geist_400Regular', '500': 'Geist_500Medium', '600': 'Geist_600SemiBold', '700': 'Geist_700Bold', '800': 'Geist_800ExtraBold',
};

/**
 * Text in Geist, using the font weight from its style. Use this instead of react-native's Text.
 * Plain text children are translated into the chosen language when a translation exists (see lib/i18n.tsx).
 */
export function Text({ style, children, ...props }: TextProps) {
  const { lang } = useLanguage();
  const weight = String(StyleSheet.flatten(style)?.fontWeight ?? '400');
  const shown = typeof children === 'string' ? translate(lang, children) : children;
  return <RNText {...props} style={[{ fontFamily: FAMILIES[weight] ?? FAMILIES['400'] }, style, { fontWeight: 'normal' }]}>{shown}</RNText>;
}
