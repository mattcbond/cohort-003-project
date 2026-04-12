/**
 * Leveling utilities for the gamification system.
 * Usable on both server and client.
 *
 * Formula: XP required to reach level N from level N-1 = round(80 * N^1.3)
 */

/**
 * Returns the XP required to advance from level n-1 to level n.
 * Level 1→2 requires xpForLevel(2) = round(80 * 2^1.3) ≈ 197 XP
 * but the threshold to reach level 2 from level 1 is xpForLevel(2).
 *
 * Actually per issue spec: Level 1→2 = 80 XP, so xpForLevel(1) = round(80 * 1^1.3) = 80.
 */
export function xpForLevel(n: number): number {
  return Math.round(80 * Math.pow(n, 1.3));
}

/**
 * Computes the current level and XP progress from a total XP amount.
 * Returns:
 *   - level: current level (starts at 1)
 *   - currentLevelXp: XP accumulated since the start of the current level
 *   - nextLevelXp: XP required to reach the next level from the start of the current level
 */
export function computeLevel(totalXp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
} {
  let level = 1;
  let xpSpent = 0;

  while (true) {
    const threshold = xpForLevel(level);
    if (xpSpent + threshold > totalXp) {
      return {
        level,
        currentLevelXp: totalXp - xpSpent,
        nextLevelXp: threshold,
      };
    }
    xpSpent += threshold;
    level++;
  }
}
