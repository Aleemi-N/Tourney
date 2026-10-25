import { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

// The same tokens as the web app's globals.css (direction A: refined indigo + Geist), light and dark.
export const palettes = {
  light: {
    background: '#f6f7fb', surface: '#ffffff', surfaceRaised: '#ffffff', surfaceMuted: '#eef1f7',
    border: '#e3e6ef', borderStrong: '#cfd5e2',
    text: '#0f172a', textSecondary: '#475569', textMuted: '#5f6b80', textInverse: '#ffffff',
    primary: '#4f46e5', primaryHover: '#4338ca', primaryText: '#ffffff',
    success: '#137333', warning: '#b45309', danger: '#c81e1e', info: '#0369a1', live: '#c81e1e',
    shadow: '#0f172a',
  },
  dark: {
    background: '#0b1020', surface: '#131a2e', surfaceRaised: '#1a2238', surfaceMuted: '#1a2238',
    border: '#253049', borderStrong: '#344061',
    text: '#f1f5f9', textSecondary: '#b4bfd2', textMuted: '#8f9bb3', textInverse: '#0b1020',
    primary: '#8b93f8', primaryHover: '#a5abfa', primaryText: '#0b1020',
    success: '#4ade80', warning: '#fbbf24', danger: '#f87171', info: '#38bdf8', live: '#f87171',
    shadow: '#000000',
  },
} as const;

export type Palette = { [K in keyof typeof palettes.light]: string };
export type ThemeChoice = 'system' | 'light' | 'dark';

/** The user's choice (system by default), set from the Account screen like the web theme toggle. */
export const ThemeChoiceContext = createContext<ThemeChoice>('system');

export function useIsDark(): boolean {
  const choice = useContext(ThemeChoiceContext);
  const system = useColorScheme();
  return choice === 'system' ? system === 'dark' : choice === 'dark';
}

export function useTheme(): Palette {
  return useIsDark() ? palettes.dark : palettes.light;
}

/** `#rrggbb` plus an opacity from 0 to 1 (the web's `/10` tints). */
export function tint(hex: string, opacity: number): string {
  return hex + Math.round(opacity * 255).toString(16).padStart(2, '0');
}

/** Text on a team colour: white or near-black, whichever contrasts more. */
export function onColor(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const lum = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const l = 0.2126 * lum((n >> 16) & 255) + 0.7152 * lum((n >> 8) & 255) + 0.0722 * lum(n & 255);
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#0b1020';
}

/** Radius scale from the web tokens. */
export const radius = { sm: 6, md: 8, lg: 10, xl: 12, '2xl': 16, '3xl': 20 } as const;
