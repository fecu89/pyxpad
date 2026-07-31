export const POSITION_GAP = 1024;

export function positionBetween(previous: number | null, next: number | null) {
  if (previous === null && next === null) return POSITION_GAP;
  if (previous === null) return next! - POSITION_GAP;
  if (next === null) return previous + POSITION_GAP;
  if (next - previous <= 1) return null;
  return Math.floor((previous + next) / 2);
}
