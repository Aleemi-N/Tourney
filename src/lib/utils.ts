import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for merging Tailwind CSS class names safely.
 * Combines clsx (conditional classes) with tailwind-merge (deduplication).
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/**
 * Background + text style for a team's own colour, with whichever of white or
 * near-black text has the higher contrast. Returns undefined for a missing or
 * malformed colour so callers can fall back to token classes.
 */
export function teamColorStyle(hex?: string | null): { backgroundColor: string; color: string } | undefined {
  if (!hex || !HEX_COLOR.test(hex)) return undefined;
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const onWhite = 1.05 / (luminance + 0.05);
  const onInk = (luminance + 0.05) / 0.0573; // #0b1020
  return { backgroundColor: hex, color: onWhite >= onInk ? '#ffffff' : '#0b1020' };
}
