export const VOLLEYBALL_POSITIONS = [
  'SETTER',
  'LIBERO',
  'MIDDLE_BLOCKER',
  'OUTSIDE_HITTER',
  'OPPOSITE',
  'UNIVERSAL',
] as const;

export function formatVolleyballPosition(position: string) {
  return position
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}
