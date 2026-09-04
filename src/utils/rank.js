/**
 * Simple increasing XP curve: level N requires N * 50 total XP more than the last.
 * (Level 1: 50xp, Level 2: 150xp, Level 3: 300xp, ...)
 */
export function xpToLevel(xp) {
  let level = 0;
  let required = 0;
  let step = 50;
  while (xp >= required + step) {
    required += step;
    level += 1;
    step += 50;
  }
  const xpIntoLevel = xp - required;
  const xpForNextLevel = step;
  return { level, xpIntoLevel, xpForNextLevel };
}
