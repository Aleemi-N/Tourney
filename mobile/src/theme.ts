import { useColorScheme } from 'react-native';

// The web app's indigo palette (direction A), light and dark.
export const palettes = {
  light: {
    background: '#f6f7fb', surface: '#ffffff', surfaceMuted: '#eef0f7', border: '#dfe3ee',
    text: '#0f172a', textSecondary: '#475569', textMuted: '#64748b',
    primary: '#4f46e5', primaryText: '#ffffff', danger: '#dc2626', success: '#15803d', warning: '#b45309',
  },
  dark: {
    background: '#0b1020', surface: '#131a2e', surfaceMuted: '#1b2440', border: '#27324f',
    text: '#f1f5f9', textSecondary: '#b6c0d4', textMuted: '#8d99b3',
    primary: '#8b93f8', primaryText: '#0b1020', danger: '#f87171', success: '#4ade80', warning: '#fbbf24',
  },
} as const;

export type Palette = { [K in keyof typeof palettes.light]: string };

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? palettes.dark : palettes.light;
}

/** Text on a team colour: white or near-black, whichever contrasts more. */
export function onColor(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const lum = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * lum((n >> 16) & 255) + 0.7152 * lum((n >> 8) & 255) + 0.0722 * lum(n & 255);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#0b1020';
}
