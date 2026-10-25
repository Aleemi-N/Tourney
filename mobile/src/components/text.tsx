import { StyleSheet, Text as RNText, type TextProps } from 'react-native';

// React Native picks a font file per weight, so a weight maps to its Geist family.
const FAMILIES: Record<string, string> = {
  '400': 'Geist_400Regular', '500': 'Geist_500Medium', '600': 'Geist_600SemiBold', '700': 'Geist_700Bold', '800': 'Geist_800ExtraBold',
};

/** Text in Geist, using the font weight from its style. Use this instead of react-native's Text. */
export function Text({ style, ...props }: TextProps) {
  const weight = String(StyleSheet.flatten(style)?.fontWeight ?? '400');
  return <RNText {...props} style={[{ fontFamily: FAMILIES[weight] ?? FAMILIES['400'] }, style, { fontWeight: 'normal' }]} />;
}
